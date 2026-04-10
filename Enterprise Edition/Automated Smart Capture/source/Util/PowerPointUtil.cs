using Microsoft.Office.Interop.PowerPoint;
using Microsoft.Office.Core;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutomatedSmartCapture.Util
{
    internal static class PowerPoint
    {
        private static Application _app;
        private static Presentation _ppt;

        public static int GetPageCount(string file)
        {
            Open(file);
            int output = _ppt.Slides.Count;
            Close();

            return output;
        }

        public static void Open(string file)
        {
            _app = new Application()
            {
                DisplayAlerts = PpAlertLevel.ppAlertsNone
            };
            _ppt = _app.Presentations.Open(file, ReadOnly: MsoTriState.msoTrue, WithWindow: MsoTriState.msoFalse);
        }

        public static void Close()
        {
            _ppt.Close();
            _app.Quit();
        }

        public static void PrintPowerPointToPdf(string input, string output)
        {
            Application ppt = new Application();

            Presentation pptDoc = ppt.Presentations.Open(input, ReadOnly: Microsoft.Office.Core.MsoTriState.msoTrue);
            pptDoc.ExportAsFixedFormat(output, PpFixedFormatType.ppFixedFormatTypePDF);
            pptDoc.Close();

            ppt.Quit();
        }
    }
}
