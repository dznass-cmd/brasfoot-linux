using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace BrasfootRevenge
{
    public class InstallerForm : Form
    {
        private TextBox txtPath;
        private Button btnBrowse;
        private CheckBox chkDesktop;
        private CheckBox chkStartMenu;
        private CheckBox chkRunNow;
        private ProgressBar prgBar;
        private Label lblStatus;
        private Button btnAction;
        private Button btnCancel;
        private bool isFinished = false;

        public InstallerForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "Instalador - Brasfoot Revenge";
            this.Size = new Size(540, 440);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(245, 245, 245);
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
            }
            catch { }

            // Header Banner
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 80,
                BackColor = Color.FromArgb(20, 83, 45) // Verde Brasfoot
            };

            Label lblTitle = new Label
            {
                Text = "⚽ Brasfoot Revenge",
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 16F, FontStyle.Bold),
                Location = new Point(20, 14),
                AutoSize = true
            };

            Label lblSubtitle = new Label
            {
                Text = "Simulador de Futebol Clássico (100% Offline, Sem Java, Sem Servidor)",
                ForeColor = Color.FromArgb(210, 235, 215),
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                Location = new Point(23, 46),
                AutoSize = true
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSubtitle);
            this.Controls.Add(pnlHeader);

            // Path Section
            Label lblDest = new Label
            {
                Text = "Pasta de Instalação:",
                Location = new Point(25, 95),
                AutoSize = true,
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };
            this.Controls.Add(lblDest);

            string defaultPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                @"Programs\Brasfoot Revenge"
            );

            txtPath = new TextBox
            {
                Text = defaultPath,
                Location = new Point(25, 120),
                Width = 370,
                Font = new Font("Segoe UI", 9F)
            };
            this.Controls.Add(txtPath);

            btnBrowse = new Button
            {
                Text = "Procurar...",
                Location = new Point(405, 118),
                Width = 95,
                Height = 26
            };
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "Selecione a pasta onde o Brasfoot Revenge será instalado:";
                    fbd.SelectedPath = txtPath.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtPath.Text = Path.Combine(fbd.SelectedPath, "Brasfoot Revenge");
                    }
                }
            };
            this.Controls.Add(btnBrowse);

            // Options
            chkDesktop = new CheckBox
            {
                Text = "Criar atalho na Área de Trabalho (Desktop)",
                Location = new Point(25, 160),
                AutoSize = true,
                Checked = true
            };
            this.Controls.Add(chkDesktop);

            chkStartMenu = new CheckBox
            {
                Text = "Criar atalho no Menu Iniciar",
                Location = new Point(25, 185),
                AutoSize = true,
                Checked = true
            };
            this.Controls.Add(chkStartMenu);

            chkRunNow = new CheckBox
            {
                Text = "Iniciar o Brasfoot Revenge após a instalação",
                Location = new Point(25, 210),
                AutoSize = true,
                Checked = true
            };
            this.Controls.Add(chkRunNow);

            // Progress & Status
            lblStatus = new Label
            {
                Text = "Pronto para instalar. Clique no botão abaixo para prosseguir.",
                Location = new Point(25, 250),
                Width = 475,
                Height = 20,
                ForeColor = Color.FromArgb(70, 70, 70)
            };
            this.Controls.Add(lblStatus);

            prgBar = new ProgressBar
            {
                Location = new Point(25, 275),
                Width = 475,
                Height = 22,
                Minimum = 0,
                Maximum = 100,
                Value = 0
            };
            this.Controls.Add(prgBar);

            // Bottom Buttons
            Panel pnlBottom = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 60,
                BackColor = Color.FromArgb(235, 235, 235)
            };

            btnAction = new Button
            {
                Text = "Instalar",
                Location = new Point(310, 15),
                Width = 100,
                Height = 30,
                BackColor = Color.FromArgb(22, 101, 52),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };
            btnAction.Click += BtnAction_Click;
            pnlBottom.Controls.Add(btnAction);

            btnCancel = new Button
            {
                Text = "Cancelar",
                Location = new Point(420, 15),
                Width = 85,
                Height = 30
            };
            btnCancel.Click += (s, e) => this.Close();
            pnlBottom.Controls.Add(btnCancel);

            this.Controls.Add(pnlBottom);
        }

        private void BtnAction_Click(object sender, EventArgs e)
        {
            if (isFinished)
            {
                if (chkRunNow.Checked)
                {
                    string exePath = Path.Combine(txtPath.Text, "BrasfootRevenge.exe");
                    if (File.Exists(exePath))
                    {
                        Process.Start(new ProcessStartInfo(exePath) { WorkingDirectory = txtPath.Text });
                    }
                }
                this.Close();
                return;
            }

            string targetDir = txtPath.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("Por favor, informe uma pasta válida para a instalação.", "Aviso", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            txtPath.Enabled = false;
            btnBrowse.Enabled = false;
            chkDesktop.Enabled = false;
            chkStartMenu.Enabled = false;
            btnAction.Enabled = false;
            btnCancel.Enabled = false;

            Thread worker = new Thread(() => RunInstallation(targetDir));
            worker.IsBackground = true;
            worker.Start();
        }

        private void RunInstallation(string targetDir)
        {
            try
            {
                UpdateStatus("Criando diretório de instalação...", 5);
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                Assembly assembly = Assembly.GetExecutingAssembly();
                Stream resStream = null;
                foreach (string name in assembly.GetManifestResourceNames())
                {
                    if (name.EndsWith("GameArchive") || name.Contains("GameArchive"))
                    {
                        resStream = assembly.GetManifestResourceStream(name);
                        break;
                    }
                }

                if (resStream == null)
                {
                    throw new Exception("O pacote de dados embutido (GameArchive) não foi encontrado no instalador.");
                }

                UpdateStatus("Extraindo dados do jogo...", 15);
                using (GZipStream gz = new GZipStream(resStream, CompressionMode.Decompress))
                {
                    byte[] lenBuf = new byte[4];
                    int extractedCount = 0;

                    while (true)
                    {
                        int r = 0;
                        while (r < 4)
                        {
                            int n = gz.Read(lenBuf, r, 4 - r);
                            if (n <= 0) break;
                            r += n;
                        }
                        if (r < 4) break;

                        int pathLen = BitConverter.ToInt32(lenBuf, 0);
                        if (pathLen <= 0) break;

                        byte[] pathBuf = new byte[pathLen];
                        r = 0;
                        while (r < pathLen)
                        {
                            int n = gz.Read(pathBuf, r, pathLen - r);
                            if (n <= 0) break;
                            r += n;
                        }
                        string relPath = Encoding.UTF8.GetString(pathBuf);

                        byte[] sizeBuf = new byte[8];
                        r = 0;
                        while (r < 8)
                        {
                            int n = gz.Read(sizeBuf, r, 8 - r);
                            if (n <= 0) break;
                            r += n;
                        }
                        long fileSize = BitConverter.ToInt64(sizeBuf, 0);

                        string destFilePath = Path.Combine(targetDir, relPath.Replace('/', Path.DirectorySeparatorChar));
                        string parentDir = Path.GetDirectoryName(destFilePath);
                        if (!Directory.Exists(parentDir))
                        {
                            Directory.CreateDirectory(parentDir);
                        }

                        using (FileStream fs = File.Create(destFilePath))
                        {
                            byte[] chunk = new byte[65536];
                            long remaining = fileSize;
                            while (remaining > 0)
                            {
                                int toRead = (int)Math.Min(chunk.Length, remaining);
                                int read = gz.Read(chunk, 0, toRead);
                                if (read <= 0) break;
                                fs.Write(chunk, 0, read);
                                remaining -= read;
                            }
                        }

                        extractedCount++;
                        if (extractedCount % 50 == 0)
                        {
                            int pct = 15 + Math.Min(70, extractedCount / 35);
                            UpdateStatus(string.Format("Instalando arquivos... ({0})", relPath), pct);
                        }
                    }
                }

                UpdateStatus("Preparando o componente de interface do Windows...", 88);
                using (var runtime = Process.Start(new ProcessStartInfo(
                    Path.Combine(targetDir, "BrasfootRevenge.exe"), "--prepare-runtime")
                    { UseShellExecute = false, WorkingDirectory = targetDir }))
                {
                    runtime.WaitForExit();
                    if (runtime.ExitCode != 0)
                        throw new Exception("O componente de interface não pôde ser preparado. Tente instalar novamente.");
                }
                UpdateStatus("Criando atalhos e desinstalador...", 90);
                string exePath = Path.Combine(targetDir, "BrasfootRevenge.exe");

                // Atalho Área de Trabalho
                if (chkDesktop.Checked)
                {
                    try
                    {
                        string desktopFolder = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                        string shortcutPath = Path.Combine(desktopFolder, "Brasfoot Revenge.lnk");
                        CreateShortcut(shortcutPath, exePath, targetDir);
                    }
                    catch { }
                }

                // Atalho Menu Iniciar
                if (chkStartMenu.Checked)
                {
                    try
                    {
                        string startMenuPrograms = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                        string menuFolder = Path.Combine(startMenuPrograms, "Brasfoot Revenge");
                        if (!Directory.Exists(menuFolder)) Directory.CreateDirectory(menuFolder);
                        string shortcutPath = Path.Combine(menuFolder, "Brasfoot Revenge.lnk");
                        CreateShortcut(shortcutPath, exePath, targetDir);
                    }
                    catch { }
                }

                // Desinstalador rápido
                try
                {
                    string uninstBat = Path.Combine(targetDir, "Desinstalar.bat");
                    string batContent = 
                        "@echo off\r\n" +
                        "chcp 65001 >nul\r\n" +
                        "echo Desinstalando o Brasfoot Revenge...\r\n" +
                        "del \"%USERPROFILE%\\Desktop\\Brasfoot Revenge.lnk\" 2>nul\r\n" +
                        "del \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Brasfoot Revenge\\Brasfoot Revenge.lnk\" 2>nul\r\n" +
                        "rmdir \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Brasfoot Revenge\" 2>nul\r\n" +
                        "set \"BRASFOOT_INSTALL_DIR=%~dp0\"\r\n" +
                        "if not exist \"%BRASFOOT_INSTALL_DIR%BrasfootRevenge.exe\" exit /b 1\r\n" +
                        "cd /d \"%TEMP%\"\r\n" +
                        "(\r\n" +
                        "rmdir /s /q \"%BRASFOOT_INSTALL_DIR%\"\r\n" +
                        "echo Brasfoot Revenge desinstalado com sucesso!\r\n" +
                        "pause\r\n" +
                        ")\r\n";
                    File.WriteAllText(uninstBat, batContent, Encoding.UTF8);
                }
                catch { }

                this.Invoke((MethodInvoker)delegate
                {
                    prgBar.Value = 100;
                    lblStatus.Text = "Instalação concluída com sucesso!";
                    lblStatus.ForeColor = Color.FromArgb(20, 83, 45);
                    btnAction.Text = "Concluir";
                    btnAction.Enabled = true;
                    btnCancel.Visible = false;
                    isFinished = true;
                });
            }
            catch (Exception ex)
            {
                this.Invoke((MethodInvoker)delegate
                {
                    MessageBox.Show("Erro durante a instalação:\n\n" + ex.Message, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    lblStatus.Text = "A instalação falhou.";
                    lblStatus.ForeColor = Color.Red;
                    btnAction.Text = "Tentar novamente";
                    txtPath.Enabled = true;
                    btnBrowse.Enabled = true;
                    chkDesktop.Enabled = true;
                    chkStartMenu.Enabled = true;
                    btnAction.Enabled = true;
                    btnCancel.Enabled = true;
                    isFinished = false;
                });
            }
        }

        private void UpdateStatus(string message, int progress)
        {
            if (this.IsHandleCreated)
            {
                this.Invoke((MethodInvoker)delegate
                {
                    lblStatus.Text = message;
                    if (progress >= 0 && progress <= 100)
                    {
                        prgBar.Value = progress;
                    }
                });
            }
        }

        private static void CreateShortcut(string shortcutPath, string targetExe, string workDir)
        {
            try
            {
                Type t = Type.GetTypeFromProgID("WScript.Shell");
                if (t != null)
                {
                    dynamic shell = Activator.CreateInstance(t);
                    var sc = shell.CreateShortcut(shortcutPath);
                    sc.TargetPath = targetExe;
                    sc.WorkingDirectory = workDir;
                    sc.IconLocation = targetExe + ",0";
                    sc.Description = "Brasfoot Revenge";
                    sc.Save();
                }
            }
            catch { }
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }
}
