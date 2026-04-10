using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace System.Windows.Forms
{
    public class AlertBox
    {
        public static DialogResult Show(string text)
        {
            return MessageBox.Show(text, "", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    public class ConfirmBox
    {
        public static DialogResult Show(string text)
        {
            return MessageBox.Show(text, "", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        }
    }

    public class ErrorBox
    {
        public static DialogResult Show(string text)
        {
            return MessageBox.Show(text, "", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
