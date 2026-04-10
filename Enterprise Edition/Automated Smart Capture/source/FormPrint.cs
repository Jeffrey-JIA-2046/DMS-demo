using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Drawing.Printing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using AutomatedSmartCapture.Properties;
using static TWAINWorkingGroup.TWAIN;
using ZXing;
using ZXing.QrCode;
using ZXing.Common;
using AutomatedSmartCapture.Util;
using System.Drawing.Imaging;
using System.IO;
using System.Text.RegularExpressions;

namespace AutomatedSmartCapture
{
    public partial class FormPrint : Form
    {
        internal FormMain Main { get; set; }
        internal CmsUtil Cms { get; set; }

        public FormPrint(FormMain main)
        {
            this.Main = main;
            this.Icon = main.Icon;
            this.Text = String.Format("{0} - QR Code Printing Center", main.Text);
            this.Cms = Program.Cms;

            InitializeComponent();
        }

        virtual protected void FormPrint_Load(object sender, EventArgs e)
        {
            //Main.SetMouseMoveEvent(PanelContainer.Panel1, PanelContainer.Panel2);
        }
    }
}
