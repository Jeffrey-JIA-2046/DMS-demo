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
using TWAINCSScan;
using TWAINCSScan.ExportTools;
using TWAINWorkingGroup;

namespace TWAINCSScan.Model
{
    internal static class Logging
    {
        private static List<Log> logs = new List<Log>();

        internal static string LogFile { get { return Program.AppSettings.LogFile; } }
        internal static int DaysToRetainLogs { get { return Program.AppSettings.DaysToRetainLogs; } }
        internal static bool DebugMode { get { return Program.AppSettings.DebugMode; } }

        internal static void Create(this string content)
        {
            FileInfo logFile = new FileInfo(LogFile);
            StreamWriter logWriter;

            // Create the file, if needed
            if (!logFile.Exists)
            {
                logFile.Create();
                logWriter = logFile.CreateText();
            }
            else
            {
                logWriter = logFile.AppendText();
            }

            // Start writing the log
            string newLog = String.Format("[{0}] {1}", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss:fff"), content);
            logWriter.WriteLine(newLog.TrimEnd('\n', '\r'));
            logWriter.Close();
        }

        internal static void Create(this Log log)
        {
            FileInfo logFile = new FileInfo(LogFile);
            StreamWriter logWriter;

            // Create the file, if needed
            if (!logFile.Exists)
            {
                logFile.Create();
                logWriter = logFile.CreateText();
            }
            else
            {
                logWriter = logFile.AppendText();
            }

            // Start writing the log
            string newLog = String.Format("[{0}] {1}", log.Timestamp.ToString("yyyy-MM-dd HH:mm:ss:fff"), log.Content);
            logWriter.WriteLine(newLog.TrimEnd('\n', '\r'));
            logWriter.Close();
        }

        internal static void Clean()
        {
            if (File.Exists(LogFile))
            {
                string[] logs = File.ReadAllLines(LogFile);

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
                    if (daySpan >= DaysToRetainLogs)
                    {
                        logs = logs.RemoveAt(n).ToArray();
                    }
                    else
                    {
                        n++;
                    }
                }

                // Write the modified version into the file
                File.WriteAllLines(LogFile, logs);
            }
        }
    }

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
                string logContent = String.Format("{0}{1}", message.Replace(".", ": "), ex.InnerException.Message);
                AddInnerExceptionLog(ex.InnerException, ref logContent);
                Content = logContent;
            }
            else
            {
                Content = String.Format("{0}{1}{2}", message.Replace(".", ": "), ex.Message, ex.StackTrace);
            }
        }

        internal void AddInnerExceptionLog(Exception ex, ref string logContent)
        {
            if (ex.InnerException != null)
            {
                logContent += "\n   as " + ex.InnerException.Message;
                AddInnerExceptionLog(ex.InnerException, ref logContent);
            }
        }
    }

    //internal class PendingLogs : List<Log>
    //{
    //    internal void Create()
    //    {
    //        FileInfo logFile = new FileInfo(Program.AppSettings.LogFile);
    //        StreamWriter logWriter = logFile.AppendText();

    //        foreach (var log in this)
    //        {
    //            // Start writing the log
    //            string newLog = String.Format("[{0}] {1}", log.Timestamp.ToString("yyyy-MM-dd HH:mm:ss:fff"), log.Content);
    //            logWriter.WriteLine(newLog.TrimEnd('\n', '\r'));
    //        }
    //        logWriter.Close();

    //        this.Clear();
    //    }
    //}
}
