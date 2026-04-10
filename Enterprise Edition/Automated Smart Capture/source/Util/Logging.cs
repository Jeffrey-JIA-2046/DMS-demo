using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.UI.WebControls;
using System.Windows.Forms;
using AutomatedSmartCapture;
using AutomatedSmartCapture.ExportTools.Documentum;

namespace AutomatedSmartCapture.Util
{
    internal static class Logging
    {
        private static FileInfo _logFile;
        private static StreamWriter _writer;
        internal static int LifespanDays { get { return Program.AppSettings.DaysToRetainLogs; } }

        internal static StreamWriter Create(string path)
        {
            try
            {
                // Initialise the log writer
                _logFile = new FileInfo(path);
                if (_logFile.Exists)
                {
                    Clean();
                }
                else
                {
                    _logFile.Create();
                }
                _writer = _logFile.AppendText();

                // App initiation log
                Write("The application starts running.");

                return _writer;
            }
            catch (Exception ex)
            {
                ErrorBox.Show("Unable to create logs: " + ex.Message);
                Environment.Exit(0);
                throw;
            }
        }

        internal static void Write(string content)
        {
            // Start writing the log
            string newLog = String.Format("[{0}] {1}", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss:fff"), content);
            _writer.WriteLine(newLog.TrimEnd('\n', '\r'));
            _writer.Flush();
        }

        internal static void Write(Exception ex, string userMsg = "")
        {
            string messages = String.Format("[{0}] {1}: {2}", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss:fff"), userMsg, ex.Message);
            string stackTrace = ex.StackTrace;

            while (ex.InnerException != null)
            {
                ex = ex.InnerException;
                messages += "\n as " + ex.Message;
            }

            // Start writing the log
            _writer.WriteLine(messages.TrimEnd('\n', '\r'));
            _writer.WriteLine(ex.StackTrace.TrimEnd('\n', '\r'));
            _writer.Flush();
        }

        internal static void Clean()
        {
            string[] logs = File.ReadAllLines(_logFile.FullName);

            // Start cleaning process
            logs = logs.WhereNot(String.IsNullOrWhiteSpace).ToArray();
            DateTime logDateTime = default;
            for (int o = 0, n = 0; n < logs.Length; o++)
            {
                string timestamp = Regex.Match(logs[n], "^\\[\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}:\\d{3}\\]").Value;
                try
                {
                    logDateTime = DateTime.ParseExact(timestamp, "[yyyy-MM-dd HH:mm:ss:fff]", CultureInfo.InvariantCulture);
                }
                catch (FormatException)
                {
                    // Retain the previous datetime value if there is no timestamp found in this line
                }

                int daySpan = DateTime.Now.Subtract(logDateTime).Days;
                if (daySpan >= LifespanDays)
                {
                    logs = logs.RemoveAt(n).ToArray();
                }
                else
                {
                    n++;
                }
            }

            // Write the modified version into the file
            File.WriteAllLines(_logFile.FullName, logs);
        }

        public static string SetQuantifier(this int count, string noun)
        {
            string quantifier = String.Format("{0} {1}", count, noun);

            if (count > 1)
            {
                return quantifier + "s";
            }
            else
            {
                return quantifier;
            }
        }
    }

    //internal class LogWriter : StreamWriter
    //{
    //    public LogWriter(string path) : base(path, true)
    //    {
    //        var file = new FileInfo(path);
    //        if (file.Exists)
    //        {
    //            this = file.CreateText();
    //        }
    //        else
    //        {

    //        }
    //    }
    //}

    internal class Log
    {
        internal DateTime Timestamp { get; set; }
        internal string Content { get; set; }

        internal Log(string message)
        {
            Timestamp = DateTime.Now;
            Content = message;
        }

        internal Log(Exception ex, string message = "")
        {
            Timestamp = DateTime.Now;

            if (ex is DfsException)
            {
                string logContent = String.Format("{0}: {1}", message.TrimEnd('.'), ex.InnerException.Message);
                AddInnerExceptionLog(ex.InnerException, ref logContent);
                Content = logContent;
            }
            else
            {
                Content = String.Format("{0}: {1}\n{2}", message.TrimEnd('.'), ex.Message, ex.StackTrace);
            }
        }

        internal static void AddInnerExceptionLog(Exception ex, ref string logContent)
        {
            if (ex.InnerException != null)
            {
                logContent += "\n   as " + ex.InnerException.Message;
                AddInnerExceptionLog(ex.InnerException, ref logContent);
            }
        }
    }
}
