using Microsoft.Office.Interop.Word;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutomatedSmartCapture.Util
{
    public static class Word
    {
        private static Application _app;
        private static Document _doc;

        public static int GetPageCount(string file)
        {
            Open(file);
            int output = _doc.ComputeStatistics(WdStatistic.wdStatisticPages);
            Close();

            return output;
        }

        public static void Open(string file)
        {
            _app = new Application()
            {
                DisplayAlerts = WdAlertLevel.wdAlertsNone,
                Visible = false
            };
            _doc = _app.Documents.Open(file, ReadOnly: true);
        }

        public static void Close()
        {
            _doc.Close(false);
            _app.Quit(false);
        }

        public static void PrintWordToPdf(string input, string output)
        {
            Application word = new Application()
            {
                DisplayAlerts = WdAlertLevel.wdAlertsNone,
                Visible = false
            };

            Document wdDoc = word.Documents.Open(input, ReadOnly: true);
            wdDoc.ExportAsFixedFormat(output, WdExportFormat.wdExportFormatPDF);
            wdDoc.Close(false);

            word.Quit(false);
        }
    }
}
