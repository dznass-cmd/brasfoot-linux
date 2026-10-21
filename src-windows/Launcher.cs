using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BrasfootRevenge
{
    public class MainForm : Form
    {
        private WebView2 webView;

        public MainForm()
        {
            this.Text = "Brasfoot Revenge";
            this.Size = new Size(1280, 820);
            this.MinimumSize = new Size(1024, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(20, 20, 20);

            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
            }
            catch { }

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            this.Controls.Add(webView);

            this.Load += MainForm_Load;
        }

        private void MainForm_Load(object sender, EventArgs e)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string indexPath = Path.Combine(baseDir, "index.html");

            if (!File.Exists(indexPath))
            {
                MessageBox.Show(
                    "Não foi possível encontrar o arquivo index.html.\n\n" +
                    "Certifique-se de que o executável BrasfootRevenge.exe está na pasta raiz do jogo.",
                    "Brasfoot Revenge - Erro",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                this.Close();
                return;
            }

            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string userDataFolder = Path.Combine(localAppData, "BrasfootRevenge", "WebView2Data");

                if (!Directory.Exists(userDataFolder))
                {
                    Directory.CreateDirectory(userDataFolder);
                }

                var envOptions = new CoreWebView2EnvironmentOptions();
                var envTask = CoreWebView2Environment.CreateAsync(null, userDataFolder, envOptions);

                envTask.ContinueWith(t =>
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        if (t.IsFaulted || t.Result == null)
                        {
                            FallbackToBrowser(indexPath);
                            return;
                        }

                        var initTask = webView.EnsureCoreWebView2Async(t.Result);
                        initTask.ContinueWith(t2 =>
                        {
                            this.Invoke((MethodInvoker)delegate
                            {
                                if (t2.IsFaulted)
                                {
                                    FallbackToBrowser(indexPath);
                                    return;
                                }

                                ConfigureAndNavigate(indexPath);
                            });
                        });
                    });
                });
            }
            catch (Exception)
            {
                FallbackToBrowser(indexPath);
            }
        }

        private void ConfigureAndNavigate(string indexPath)
        {
            try
            {
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                webView.CoreWebView2.Settings.IsZoomControlEnabled = false;
                webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;

                webView.CoreWebView2.NavigationStarting += (s, args) =>
                {
                    Uri uri;
                    if (Uri.TryCreate(args.Uri, UriKind.Absolute, out uri))
                    {
                        if (uri.Scheme != "file" && uri.Scheme != "data" && uri.Scheme != "about" && uri.Scheme != "blob")
                        {
                            args.Cancel = true;
                        }
                    }
                };

                string fileUri = new Uri(indexPath).AbsoluteUri;
                webView.CoreWebView2.Navigate(fileUri);
            }
            catch (Exception)
            {
                FallbackToBrowser(indexPath);
            }
        }

        private void FallbackToBrowser(string indexPath)
        {
            try
            {
                string fileUri = new Uri(indexPath).AbsoluteUri;
                Process.Start(new ProcessStartInfo(fileUri) { UseShellExecute = true });
            }
            catch { }
            this.Close();
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
