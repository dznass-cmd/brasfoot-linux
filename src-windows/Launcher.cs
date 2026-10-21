using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace BrasfootRevenge
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string indexPath = Path.Combine(baseDir, "index.html");

                if (!File.Exists(indexPath))
                {
                    MessageBox.Show(
                        "Não foi possível encontrar o arquivo index.html.\n\n" +
                        "Certifique-se de que o executável BrasfootRevenge.exe está localizado na pasta do jogo.",
                        "Brasfoot Revenge - Erro",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                string fileUri = "file:///" + indexPath.Replace('\\', '/');
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string userDataDir = Path.Combine(localAppData, "BrasfootRevenge", "UserData");

                try
                {
                    if (!Directory.Exists(userDataDir))
                    {
                        Directory.CreateDirectory(userDataDir);
                    }
                }
                catch { }

                // Procurar executáveis Chromium (Edge, Chrome, Brave) para abrir em janela de aplicativo dedicada
                string[] browserCandidates = new string[]
                {
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                    Path.Combine(localAppData, @"Microsoft\Edge\Application\msedge.exe"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
                    Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"BraveSoftware\Brave-Browser\Application\brave.exe"),
                    Path.Combine(localAppData, @"BraveSoftware\Brave-Browser\Application\brave.exe")
                };

                string foundBrowser = null;
                foreach (string candidate in browserCandidates)
                {
                    if (File.Exists(candidate))
                    {
                        foundBrowser = candidate;
                        break;
                    }
                }

                if (foundBrowser != null)
                {
                    string args = string.Format(
                        "--app=\"{0}\" --window-size=1280,820 --user-data-dir=\"{1}\" --disable-extensions --disable-component-update --allow-file-access-from-files",
                        fileUri,
                        userDataDir
                    );

                    ProcessStartInfo psi = new ProcessStartInfo(foundBrowser, args);
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                }
                else
                {
                    // Fallback para o navegador padrão do sistema Windows
                    ProcessStartInfo psi = new ProcessStartInfo(fileUri);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Ocorreu um erro ao iniciar o Brasfoot Revenge:\n\n" + ex.Message,
                    "Brasfoot Revenge",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
        }
    }
}
