using System;
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
        private readonly bool smokeTest;
        private readonly Timer smokeTimeout;

        public MainForm(bool smokeTest = false)
        {
            this.smokeTest = smokeTest;
            if (smokeTest)
            {
                smokeTimeout = new Timer { Interval = 60000 };
                smokeTimeout.Tick += (s, e) => { Environment.ExitCode = 1; Close(); };
                smokeTimeout.Start();
                FormClosed += (s, e) => { smokeTimeout.Dispose(); };
            }
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
            string indexPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "index.html");
            if (!File.Exists(indexPath))
            {
                ShowStartupError(new FileNotFoundException("Restaure a pasta completa do jogo: index.html não foi encontrado."));
                return;
            }
            System.Threading.Tasks.Task.Factory.StartNew(() => RuntimeSetup.EnsureInstalled())
                .ContinueWith(setup => PostToWindow(() =>
                {
                    if (setup.IsFaulted) { ShowStartupError(setup.Exception.GetBaseException()); return; }
                    try
                    {
                        string userDataFolder = Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                            "BrasfootRevenge", "WebView2Data");
                        if (smokeTest) userDataFolder = Path.Combine(Path.GetTempPath(),
                            "BrasfootRevengeSmoke-" + Guid.NewGuid().ToString("N"));
                        Directory.CreateDirectory(userDataFolder);
                        CoreWebView2Environment.CreateAsync(null, userDataFolder).ContinueWith(environment =>
                            PostToWindow(() =>
                            {
                                if (environment.IsFaulted) { ShowStartupError(environment.Exception.GetBaseException()); return; }
                                try
                                {
                                    webView.EnsureCoreWebView2Async(environment.Result).ContinueWith(initialized =>
                                        PostToWindow(() =>
                                        {
                                            if (initialized.IsFaulted) { ShowStartupError(initialized.Exception.GetBaseException()); return; }
                                            try { ConfigureAndNavigate(indexPath); }
                                            catch (Exception ex) { ShowStartupError(ex); }
                                        }));
                                }
                                catch (Exception ex) { ShowStartupError(ex); }
                            }));
                    }
                    catch (Exception ex) { ShowStartupError(ex); }
                }));
        }

        private void PostToWindow(Action action)
        {
            if (IsDisposed || Disposing || !IsHandleCreated) return;
            try { BeginInvoke((MethodInvoker)delegate { if (!IsDisposed && !Disposing) action(); }); }
            catch (InvalidOperationException) { /* The window closed while setup completed. */ }
        }

        private void ShowStartupError(Exception error)
        {
            Environment.ExitCode = 1;
            if (!smokeTest) MessageBox.Show(this, "Não foi possível iniciar o Brasfoot Revenge.\n\n" + error.Message,
                "Brasfoot Revenge", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }

        private void ConfigureAndNavigate(string indexPath)
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

            webView.CoreWebView2.NewWindowRequested += (s, args) => { args.Handled = true; };
            webView.CoreWebView2.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            webView.CoreWebView2.WebResourceRequested += (s, args) =>
            {
                Uri resource;
                if (!Uri.TryCreate(args.Request.Uri, UriKind.Absolute, out resource) ||
                    (resource.Scheme != "file" && resource.Scheme != "data" &&
                     resource.Scheme != "blob" && resource.Scheme != "about") ||
                    (resource.Scheme == "file" && !string.IsNullOrEmpty(resource.Host) && resource.Host != "localhost"))
                    args.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                        new MemoryStream(new byte[0]), 403, "Offline", "Content-Type: text/plain");
            };
            if (smokeTest)
            {
                webView.CoreWebView2.NavigationCompleted += (s, args) =>
                {
                    if (!args.IsSuccess) { Environment.ExitCode = 1; Close(); return; }
                    webView.CoreWebView2.ExecuteScriptAsync(@"(() => {
                        const key = 'brasfoot_windows_smoke_test';
                        localStorage.setItem(key, 'ok');
                        const saved = localStorage.getItem(key) === 'ok';
                        localStorage.removeItem(key);
                        return saved && typeof app !== 'undefined' && app.allTeams.length === 703 &&
                            typeof window.MatchEngine === 'function' &&
                            document.getElementById('new-game-subtitle').textContent.includes('2026');
                    })()").ContinueWith(result => PostToWindow(() =>
                    {
                        Environment.ExitCode = !result.IsFaulted && result.Result == "true" ? 0 : 1;
                        Close();
                    }));
                };
            }
            string fileUri = new Uri(indexPath).AbsoluteUri;
            webView.CoreWebView2.Navigate(fileUri);
        }

        [STAThread]
        static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                if (args.Length == 1 && args[0] == "--prepare-runtime")
                {
                    RuntimeSetup.EnsureInstalled();
                    return 0;
                }
                Application.Run(new MainForm(args.Length == 1 && args[0] == "--smoke-test"));
                return Environment.ExitCode;
            }
            catch (Exception ex)
            {
                if (args.Length != 1 || args[0] != "--smoke-test")
                    MessageBox.Show(ex.Message, "Brasfoot Revenge", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}

namespace BrasfootRevenge
{
    internal static class RuntimeSetup
    {
        private static bool IsInstalled()
        {
            try { return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString()); }
            catch (WebView2RuntimeNotFoundException) { return false; }
        }

        internal static void EnsureInstalled()
        {
            if (IsInstalled()) return;
            string installer = Path.Combine(AppDomain.CurrentDomain.BaseDirectory,
                "prerequisites", "MicrosoftEdgeWebView2RuntimeInstallerX64.exe");
            if (!File.Exists(installer))
                throw new FileNotFoundException("O componente WebView2 está ausente. Extraia novamente o pacote completo, incluindo a pasta prerequisites.");
            var info = new System.Diagnostics.ProcessStartInfo(installer, "/silent /install")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(installer)
            };
            using (var process = System.Diagnostics.Process.Start(info))
            {
                process.WaitForExit();
                if (!IsInstalled())
                    throw new InvalidOperationException("Não foi possível instalar o WebView2 (código " +
                        process.ExitCode + "). Execute o instalador em prerequisites e tente novamente.");
            }
        }
    }
}
