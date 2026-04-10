using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Drawing.Printing;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.IO;
using ZXing.Common;
using ZXing.QrCode;
using ZXing;
using ExportTools;
//using PresentationControls;

namespace AutomatedSmartCapture
{
    public partial class FormEmp : FormPrint
    {
        private ComponentResourceManager resources = new ComponentResourceManager(typeof(FormEmp));

        private List<PictureBox> RemoveBtns = new List<PictureBox>();

        public FormEmp(FormMain main) : base(main)
        {
            InitializeComponent();

            this.BindControlsX(EmpTable, numAddRows);
            this.BindControlsX(numAddRows, label1);
            this.BindControlsX(label1, btnAddRows);
            PanelContainer.Width = btnAddRows.Right + 10;
        }

        protected override void FormPrint_Load(object sender, EventArgs e)
        {
            //Main.SetMouseMoveEvent(PanelContainer.Panel1, PanelContainer.Panel2, EmpTable);
        }

        private void FormEmp_Load(object sender, EventArgs e)
        {
            string divListFile = "";

            if (File.Exists(divListFile))
            {
                foreach (string division in File.ReadAllLines(divListFile))
                {
                    colDivision.Items.Add(division);
                }
            }
            else
            {
                MessageBox.Show("Unable to find file division.txt for the list of Division field options.");
            }
        }

        private void btnAddRows_Click(object sender, EventArgs e)
        {
            for (int i = 0; i < (int)numAddRows.Value; i++)
            {
                DateTime now = DateTime.Now;
                String timeID = string.Format("{0}{1}{2}{3}{4}", now.DayOfYear, now.Hour, now.Minute, now.Second, now.Millisecond);
                EmpTable.Rows.Add(timeID);

                PictureBox btnRemoveRow = new PictureBox();
                btnRemoveRow.Name = "btnRemoveRow" + timeID;
                btnRemoveRow.Image = (Image)resources.GetObject("btnRemoveRows.Image");
                btnRemoveRow.SizeMode = PictureBoxSizeMode.StretchImage;
                btnRemoveRow.Size = new System.Drawing.Size(20, 20);
                btnRemoveRow.Cursor = Cursors.Hand;
                btnRemoveRow.Click += btnRemoveRow_Click;
                PanelContainer.Panel1.Controls.Add(btnRemoveRow);
                if (EmpTable.Rows.Count > 1)
                {
                    BindControlsY(RemoveBtns.Last(), btnRemoveRow, EmpTable.Rows[EmpTable.Rows.Count - 2].Height);
                }
                else
                {
                    BindControlsY(numAddRows, btnRemoveRow, EmpTable.ColumnHeadersHeight);
                }
                RemoveBtns.Add(btnRemoveRow);
            }
        }

        private void btnRemoveRow_Click(object sender, EventArgs e)
        {
            String id = ((PictureBox)sender).Name.Remove(0, "btnRemoveRow".Length);
            DataGridViewRow removedRow = EmpTable.Rows.OfType<DataGridViewRow>().Where(r => r.Cells[0].Value.Equals(id)).FirstOrDefault();

            PanelContainer.Panel1.Controls.Remove((PictureBox)sender);
            RemoveBtns.Remove((PictureBox)sender);
            foreach (PictureBox btn in RemoveBtns)
            {
                if (btn.Top > ((PictureBox)sender).Top)
                {
                    btn.Top -= removedRow.Height;
                }
            }
            EmpTable.Rows.Remove(removedRow);
        }

        private void EmpTable_CellValidating(object sender, DataGridViewCellValidatingEventArgs e)
        {
            var value = e.FormattedValue;
            string strVal = (string)value ?? "";

            if (e.RowIndex > -1 & e.ColumnIndex == 1)
            {
                Regex pattern = new Regex(@"^[0-9]{8}$");
                if (!pattern.IsMatch(strVal) & strVal.Length > 0)
                {
                    MessageBox.Show("Invalid Employee ID.");
                    EmpTable.Rows[e.RowIndex].Cells[1].Style.BackColor = Color.Red;
                }
                else
                {
                    EmpTable.Rows[e.RowIndex].Cells[1].Style.BackColor = Color.White;
                }
            }
            else
            {
                if ((e.FormattedValue as string ?? "").Contains("||"))
                {
                    MessageBox.Show("\"||\" in any field is not allowed.");
                    EmpTable.Rows[e.RowIndex].Cells[1].Style.BackColor = Color.Red;
                }
                else
                {
                    EmpTable.Rows[e.RowIndex].Cells[1].Style.BackColor = Color.White;
                }
            }
        }

        private void EmpTable_Sorted(object sender, EventArgs e)
        {
            RemoveBtns.Clear();
            for (int i = 0; i < EmpTable.RowCount; i++)
            {
                PictureBox btnRemoveRow = (PictureBox)this.PanelContainer.Panel1.Controls.Find("btnRemoveRow" + EmpTable.Rows[i].Cells[0].Value, false)[0];
                if (RemoveBtns.Count > 0)
                {
                    BindControlsY(RemoveBtns.Last(), btnRemoveRow, EmpTable.Rows[EmpTable.Rows.Count - 2].Height);
                }
                else
                {
                    BindControlsY(numAddRows, btnRemoveRow, EmpTable.ColumnHeadersHeight);
                }
                BindControlsX(btnRemoveRow, new Label { Text = btnRemoveRow.Name });
                RemoveBtns.Add(btnRemoveRow);
            }
        }

        private void btnSwitchTable_Click(object sender, EventArgs e)
        {
            this.Hide();
            this.Main._FormPrint.ShowDialog();
        }

        private void btnImport_Click(object sender, EventArgs e)
        {
            //OpenFileDialog dialogImport = new OpenFileDialog
            //{
            //    Title = "Browse Excel Files for Import",
            //    Filter = "|Microsoft Excel Spreadsheet (xls,xlsx)|*.xls;*.xlsx",
            //    Multiselect = true
            //};

            //if (dialogImport.ShowDialog() == DialogResult.OK)
            //{
            //    Excel.Open();

            //}
        }

        private int RowIndex;

        private void btnPrint_Click(object sender, EventArgs e)
        {
            RowIndex = 0;

            if (EmpTable.Visible)
            {
                foreach (DataGridViewRow row in EmpTable.Rows)
                {
                    if (row.Cells[1].Value == null)
                    {
                        MessageBox.Show("Please input Employee ID for every row.");
                        return;
                    }
                    if (row.Cells[1].Style.BackColor == Color.Red)
                    {
                        MessageBox.Show("Please correct the invalid Employee ID(s).");
                        return;
                    }
                }
            }

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
            DataGridViewRow Row = EmpTable.Rows[RowIndex];
            var Cells = Row.Cells.OfType<DataGridViewCell>().Where(cell => cell.ColumnIndex > 0);
            var Fields = Cells.ToDictionary(cell => EmpTable.Columns[cell.ColumnIndex].HeaderText, cell => cell.Value?.ToString());

            String empInfo = String.Join("||", Fields.Values);
            String b64Str = Convert.ToBase64String(Encoding.UTF8.GetBytes(empInfo));

            int qrPrintSize = Program.AppSettings.QREncodeSize;
            BarcodeWriter writer = new BarcodeWriter 
            { 
                Format = BarcodeFormat.QR_CODE, 
                Options = { Margin = 0, Width = qrPrintSize, Height = qrPrintSize } 
            };
            BitMatrix qrMatrix = writer.Encode(b64Str);

            using (Bitmap bmp = writer.Write(qrMatrix))
            {
                bmp.MakeTransparent(Color.White);

                Image img = (Image)bmp.Clone();
                e.Graphics.DrawImage(img, 50, 50);
                e.Graphics.DrawString(Fields["Employee ID"], new Font("Arial", 50), new SolidBrush(Color.Black), 50, qrPrintSize + 200);
                e.Graphics.DrawString(Fields["Name"], new Font("Arial", 30), new SolidBrush(Color.Black), 50, qrPrintSize + 300);
                e.Graphics.DrawString(Fields["Division"], new Font("Arial", 30), new SolidBrush(Color.Black), 50, qrPrintSize + 350);
                e.Graphics.DrawString(Fields["Remark"], new Font("Arial", 30), new SolidBrush(Color.Black), 50, qrPrintSize + 400);

                bmp.Dispose();
                e.Graphics.Dispose();
            }

            if (RowIndex == EmpTable.RowCount - 1)
            {
                e.HasMorePages = false;
            }
            else
            {
                e.HasMorePages = true;
                RowIndex++;
                return;
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
