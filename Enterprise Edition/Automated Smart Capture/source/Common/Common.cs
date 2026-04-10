using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using System.ComponentModel;
using System.IO;
namespace ExportTools
{
    public static class Common
    {
        public static void InvokeIfRequired(this ISynchronizeInvoke obj,
                                         MethodInvoker action)
        {
            if (obj.InvokeRequired)
            {
                var args = new object[0];
                obj.Invoke(action, args);
            }
            else
            {
                action();
            }
        }

        public static string MsgTypeError = "Error";
        public static string MsgTypeLog = "Log";

    }
    // C# Code
    public static class Rfc4180Writer
    {
        private static string QuoteValue(string value)
        {
            return String.Concat("\"", value.Replace("\"", "\"\""), "\"");
        }
    }
}
