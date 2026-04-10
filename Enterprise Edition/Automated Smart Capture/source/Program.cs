using Emc.Documentum.FS.DataModel.Core.Query;
using Emc.Documentum.FS.Runtime.Context;
using Emc.Documentum.FS.Services.Core;
using Emc.Documentum.FS.Services.Search;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using AutomatedSmartCapture.Model;
using AutomatedSmartCapture.Properties;
using AutomatedSmartCapture.Util;
using AutomatedSmartCapture.ExportTools.Documentum;
using System.Threading.Tasks;

namespace AutomatedSmartCapture
{
    static class Program
    {
        internal static CmsUtil Cms { get; set; }
        internal static Dictionary<string, dynamic> DfsData { get; set; }
        public static Settings AppSettings { get { return Settings.Default; } }

        /// <summary>
        /// The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            // Settings by default
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Generic exception handling
            AppDomain.CurrentDomain.UnhandledException += new UnhandledExceptionEventHandler(UnhandledExceptionHandler);
            Application.ThreadException += new ThreadExceptionEventHandler(ThreadExceptionHandler);

            // Create Mutex to prevent duplicate execution of application
            bool isUnique;
            Mutex mutex = new Mutex(false, "AppMutex", out isUnique);
            if (!isUnique)
            {
                MessageBox.Show("Another instance of this application is running.");
                return;
            }

            try
            {
                StreamWriter logWriter1;
                FileInfo logFile = new FileInfo("log.txt");
                if (!logFile.Exists)
                {
                    logWriter1 = logFile.CreateText();
                    logWriter1.Close();
                }
            }
            catch (Exception ex) {
                Logging.Write(ex, "Failed to initialize log file");
            }   
         
        
            // Logging throughout the whole application
            using (StreamWriter logWriter = Logging.Create("log.txt"))
            {
                // Clear or create the temp folder
                if (Directory.Exists("temp"))
                {
                    foreach (string tempFile in Directory.EnumerateFiles("temp", "*.*", SearchOption.AllDirectories))
                    {
                        try
                        {
                            System.IO.File.Delete(tempFile);
                        }
                        catch (Exception ex)
                        {
                            Logging.Write(ex, "Failed to delete file in temp folder");
                        }
                    }
                }
                else
                {
                    Directory.CreateDirectory("temp");
                }

                // Prepare for server connection
                InitiateCmsServerConnection();

                // Run the application
                FormMain mainForm = new FormMain();
                Application.Run(mainForm);

                // Keep mutex until the end
                GC.KeepAlive(mutex);
            }
        }

        internal static void InitiateCmsServerConnection()
        {
            Program.Cms = new CmsUtil(AppSettings.ServerURI);

            // If CMS server authentication and application login are independent
            if (!AppSettings.SingleLoginMode)
            {
                // Perform server authentication before application login
                try
                {
                    if (!Cms.Authenticate(AppSettings.ServerLoginName, AppSettings.ServerPassword))
                    {
                        // Server error handling is included in the Authentication method, so just exit the application
                        Application.Exit();
                    }
                }
                catch (Exception ex)
                {
                    Program.HandleGenericException(ex, "Server authentication failed.");
                    Application.Exit();
                }
            }
        }

        static void ThreadExceptionHandler(object sender, ThreadExceptionEventArgs args)
        {
            HandleGenericException(args.Exception, "Undefined error occurred.");
        }

        static void UnhandledExceptionHandler(object sender, UnhandledExceptionEventArgs args)
        {
            HandleGenericException(args.ExceptionObject as Exception, "Undefined error occurred.");
        }

        internal static void HandleGenericException(Exception ex, string userMsg)
        {
            Logging.Write(ex, userMsg);
            ErrorBox.Show(userMsg);
        }
    }
}
