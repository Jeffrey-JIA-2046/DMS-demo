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
using ZXing.Common;
using ZXing.QrCode;
using ZXing;
using PresentationControls;
using ExportTools;
using Emc.Documentum.FS.DataModel.Core.Query;
using System.IO;

namespace AutomatedSmartCapture
{
    public partial class FormDocCat : FormPrint
    {
        private ComponentResourceManager resources = new ComponentResourceManager(typeof(FormDocCat));

        private List<PictureBox> RemoveBtns = new List<PictureBox>();

        public FormDocCat(FormMain main) : base(main)
        {
            InitializeComponent();

            this.BindControlsX(DocCatTable, numAddRows);
            this.BindControlsX(numAddRows, label1);
            this.BindControlsX(label1, btnAddRows);

            this.Width = this.Main._FormPrint.Width;
            this.PanelContainer.Width = this.Main._FormPrint.Width;
        }

        protected override void FormPrint_Load(object sender, EventArgs e)
        {
            //Main.SetMouseMoveEvent(PanelContainer.Panel1, PanelContainer.Panel2, DocCatTable);
        }

        private void FormDocCat_Load(object sender, EventArgs e)
        {
            List<string> DocCatList = Main.DfsData["DocCatList"];
            ListSelectionWrapper<string> wrappedList = new ListSelectionWrapper<string>(DocCatList.OrderBy(docCat => docCat));
            wrappedList.TextSeparator = this.colDocCat.TextSeparator;

            this.colDocCat.DataSource = wrappedList;
            this.colDocCat.ValueMember = "Selected";
            this.colDocCat.DisplayMember = "NameConcatenated";
        }

        private void btnAddRows_Click(object sender, EventArgs e)
        {
            for (int i = 0; i < (int)numAddRows.Value; i++)
            {
                DateTime now = DateTime.Now;
                String timeID = string.Format("{0}{1}{2}{3}{4}", now.DayOfYear, now.Hour, now.Minute, now.Second, now.Millisecond);
                DocCatTable.Rows.Add(timeID, Convert.DBNull);

                PictureBox btnRemoveRow = new PictureBox();
                btnRemoveRow.Name = "btnRemoveRow" + timeID;
                btnRemoveRow.Image = (Image)resources.GetObject("btnRemoveRows.Image");
                btnRemoveRow.SizeMode = PictureBoxSizeMode.StretchImage;
                btnRemoveRow.Size = new System.Drawing.Size(20, 20);
                btnRemoveRow.Cursor = Cursors.Hand;
                btnRemoveRow.Click += btnRemoveRow_Click;
                PanelContainer.Panel1.Controls.Add(btnRemoveRow);
                if (DocCatTable.Rows.Count > 1)
                {
                    BindControlsY(RemoveBtns.Last(), btnRemoveRow, DocCatTable.Rows[DocCatTable.Rows.Count - 2].Height);
                }
                else
                {
                    BindControlsY(numAddRows, btnRemoveRow, DocCatTable.ColumnHeadersHeight);
                }
                RemoveBtns.Add(btnRemoveRow);
            }
        }

        private void btnRemoveRow_Click(object sender, EventArgs e)
        {
            String id = ((PictureBox)sender).Name.Remove(0, "btnRemoveRow".Length);
            DataGridViewRow removedRow = DocCatTable.Rows.OfType<DataGridViewRow>().Where(r => r.Cells[0].Value.Equals(id)).FirstOrDefault();

            PanelContainer.Panel1.Controls.Remove((PictureBox)sender);
            RemoveBtns.Remove((PictureBox)sender);
            foreach (PictureBox btn in RemoveBtns)
            {
                if (btn.Top > ((PictureBox)sender).Top)
                {
                    btn.Top -= removedRow.Height;
                }
            }
            DocCatTable.Rows.Remove(removedRow);
        }

        private void DocCatTable_CellValidating(object sender, DataGridViewCellValidatingEventArgs e)
        {
            if (e.RowIndex > -1 & e.ColumnIndex == 2 & !String.IsNullOrEmpty((string)e.FormattedValue))
            {
                if (e.FormattedValue is "0")
                {
                    MessageBox.Show("The Quantity field cannot be 0.");
                    e.Cancel = true;
                }
            }
        }

        private void btnSwitchTable_Click(object sender, EventArgs e)
        {
            this.Hide();
            this.Main._FormPrint.Show();
        }

        private int RowIndex;
        private int CopyNo;

        private void btnPrint_Click(object sender, EventArgs e)
        {
            foreach (DataGridViewRow row in DocCatTable.Rows)
            {
                foreach (DataGridViewCell cell in row.Cells)
                {
                    if (cell.Value == null)
                    {
                        MessageBox.Show("Please input for every row.");
                        return;
                    }
                }
            }

            RowIndex = 0;
            CopyNo = 1;

            PrintDocument printDoc = new PrintDocument();
            PrintDialog printDialog = new PrintDialog();
            printDoc.PrintPage += new PrintPageEventHandler(PrintPage);
            printDialog.Document = printDoc;
            if (printDialog.ShowDialog() == DialogResult.OK)
            {
                printDoc.Print();
            }
        }

        private void PrintPage(object o, PrintPageEventArgs e)
        {
            try
            {
                string[] SelectedDocCat = (DocCatTable.Rows[RowIndex].Cells[1].Value as Dictionary<String, Object>).Keys.ToArray<String>();
                string qty = (string)DocCatTable.Rows[RowIndex].Cells[2].Value;
                int CopyCount = int.Parse(qty) * SelectedDocCat.Length;

                string docCat = SelectedDocCat[(CopyNo - 1) / int.Parse(qty)];
                string qrStr = Convert.ToBase64String(Encoding.UTF8.GetBytes(docCat)); // Encode the string at least once
                for (int i = 0; i < Program.AppSettings.Base64Loop; i++)
                {
                    qrStr = Convert.ToBase64String(Encoding.UTF8.GetBytes(qrStr));
                }

                int qrPrintSize = Program.AppSettings.QREncodeSize;
                BarcodeWriter writer = new BarcodeWriter
                {
                    Format = BarcodeFormat.QR_CODE,
                    Options = { Margin = 0, Width = qrPrintSize, Height = qrPrintSize }
                };
                BitMatrix qrMatrix = writer.Encode(qrStr);

                using (Bitmap bmp = writer.Write(qrMatrix))
                {
                    bmp.MakeTransparent(Color.White);

                    Image img = (Image)bmp.Clone();
                    e.Graphics.DrawImage(img, 50, 50);
                    e.Graphics.DrawString(docCat, new Font("Arial", 20), new SolidBrush(Color.Black), 50, qrPrintSize + 200);

                    bmp.Dispose();
                    e.Graphics.Dispose();
                }

                if (RowIndex == DocCatTable.RowCount - 1 & CopyNo >= CopyCount)
                {
                    e.HasMorePages = false;
                }
                else
                {
                    e.HasMorePages = true;
                    if (CopyNo >= CopyCount)
                    {
                        RowIndex++;
                        CopyNo = 1;
                    }
                    else
                    {
                        CopyNo++;
                    }
                    return;
                }
            }
            catch (NullReferenceException ex)
            {
                MessageBox.Show(ex.Message);
            }
        }

        private void BindControlsX(Control left, Control right)
        {
            int x = left.Right + 5;
            int y = left.Location.Y;
            right.Location = new Point(x, y);
        }

        private void BindControlsY(Control top, Control bottom, int offset = 5)
        {
            int x = top.Location.X;
            int y = top.Top + offset;
            bottom.Location = new Point(x, y);
        }
    }
}
