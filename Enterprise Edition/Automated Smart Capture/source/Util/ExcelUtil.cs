using Microsoft.Office.Interop.Excel;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutomatedSmartCapture.Util
{
    internal static class Excel
    {
        private static Application _app;
        private static Workbook _wkbk;

        public static int GetPageCount(string file)
        {
            Open(file);
            int output = 0;
            foreach (Worksheet sheet in _wkbk.Sheets)
            {
                output += sheet.PageSetup.Pages.Count;
            }
            Close();

            return output;
        }

        public static void Open(string file)
        {
            _app = new Application()
            {
                DisplayAlerts = false,
                Visible = false
            };
            _wkbk = _app.Workbooks.Open(file, ReadOnly: true);
        }

        public static void Close()
        {
            _wkbk.Close(SaveChanges: false);
            _app.Quit();
        }

        public static void PrintExcelToPdf(string input, string output)
        {
            Application excel = new Application()
            {
                DisplayAlerts = false,
                Visible = false
            };

            Workbook xlDoc = excel.Workbooks.Open(input, ReadOnly: true);
            xlDoc.ExportAsFixedFormat(XlFixedFormatType.xlTypePDF, output);
            xlDoc.Close(SaveChanges: false);
            excel.Quit();

        }
    }
}
