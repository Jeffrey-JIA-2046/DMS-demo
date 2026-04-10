using System;
using System.Windows.Forms;

namespace AutomatedSmartCapture
{
    partial class FormEmp
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle1 = new System.Windows.Forms.DataGridViewCellStyle();
            System.Windows.Forms.DataGridViewCellStyle dataGridViewCellStyle2 = new System.Windows.Forms.DataGridViewCellStyle();
            this.EmpTable = new System.Windows.Forms.DataGridView();
            this.colEmpRowID = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colEmpID = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colName = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colDivision = new System.Windows.Forms.DataGridViewComboBoxColumn();
            this.colRemark = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.numAddRows = new System.Windows.Forms.NumericUpDown();
            this.label1 = new System.Windows.Forms.Label();
            this.btnAddRows = new System.Windows.Forms.PictureBox();
            this.btnSwitch = new System.Windows.Forms.Button();
            this.btnPrint = new System.Windows.Forms.Button();
            this.btnImport = new System.Windows.Forms.Button();
            ((System.ComponentModel.ISupportInitialize)(this.PanelContainer)).BeginInit();
            this.PanelContainer.Panel1.SuspendLayout();
            this.PanelContainer.Panel2.SuspendLayout();
            this.PanelContainer.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.EmpTable)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.numAddRows)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.btnAddRows)).BeginInit();
            this.SuspendLayout();
            // 
            // PanelContainer
            // 
            this.PanelContainer.IsSplitterFixed = true;
            this.PanelContainer.Location = new System.Drawing.Point(1, -1);
            this.PanelContainer.Name = "PanelContainer";
            this.PanelContainer.Orientation = System.Windows.Forms.Orientation.Horizontal;
            this.PanelContainer.Size = new System.Drawing.Size(948, 676);
            this.PanelContainer.SplitterDistance = 606;
            this.PanelContainer.SplitterWidth = 1;
            this.PanelContainer.TabIndex = 130;
            // 
            // PanelContainer.Panel1
            // 
            this.PanelContainer.Panel1.AutoScroll = true;
            this.PanelContainer.Panel1.BackgroundImageLayout = System.Windows.Forms.ImageLayout.None;
            this.PanelContainer.Panel1.Controls.Add(this.EmpTable);
            this.PanelContainer.Panel1.Controls.Add(this.numAddRows);
            this.PanelContainer.Panel1.Controls.Add(this.label1);
            this.PanelContainer.Panel1.Controls.Add(this.btnAddRows);
            // 
            // PanelContainer.Panel2
            // 
            this.PanelContainer.Panel2.BackColor = System.Drawing.SystemColors.Window;
            this.PanelContainer.Panel2.BackgroundImageLayout = System.Windows.Forms.ImageLayout.None;
            this.PanelContainer.Panel2.Controls.Add(this.btnSwitch);
            this.PanelContainer.Panel2.Controls.Add(this.btnPrint);
            // 
            // EmpTable
            // 
            this.EmpTable.AllowUserToAddRows = false;
            this.EmpTable.AutoSize = true;//this.EmpTable.AutoSize = true;
            //this.EmpTable.AutoSize = true;
            this.EmpTable.BackgroundColor = System.Drawing.SystemColors.Control;
            this.EmpTable.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.EmpTable.CellBorderStyle = System.Windows.Forms.DataGridViewCellBorderStyle.Sunken;
            this.EmpTable.ColumnHeadersBorderStyle = System.Windows.Forms.DataGridViewHeaderBorderStyle.Single;
            dataGridViewCellStyle1.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
            dataGridViewCellStyle1.BackColor = System.Drawing.Color.LightGray;
            dataGridViewCellStyle1.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            dataGridViewCellStyle1.ForeColor = System.Drawing.SystemColors.GrayText;
            dataGridViewCellStyle1.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle1.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle1.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
            this.EmpTable.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle1;
            this.EmpTable.ColumnHeadersHeight = 30;
            this.EmpTable.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.colEmpRowID,
            this.colEmpID,
            this.colName,
            this.colDivision,
            this.colRemark});
            dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
            dataGridViewCellStyle2.BackColor = System.Drawing.SystemColors.ControlLightLight;
            dataGridViewCellStyle2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            dataGridViewCellStyle2.ForeColor = System.Drawing.SystemColors.ControlText;
            dataGridViewCellStyle2.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle2.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle2.WrapMode = System.Windows.Forms.DataGridViewTriState.False;
            this.EmpTable.DefaultCellStyle = dataGridViewCellStyle2;
            this.EmpTable.EnableHeadersVisualStyles = false;
            this.EmpTable.GridColor = System.Drawing.SystemColors.Control;
            this.EmpTable.Location = new System.Drawing.Point(4, 6);
            this.EmpTable.Name = "EmpTable";
            this.EmpTable.RowHeadersVisible = false;
            this.EmpTable.RowHeadersWidth = 62;
            this.EmpTable.RowTemplate.Height = 28;
            this.EmpTable.ScrollBars = System.Windows.Forms.ScrollBars.None;
            this.EmpTable.Size = new System.Drawing.Size(616, 150);
            this.EmpTable.TabIndex = 0;
            this.EmpTable.CellValidating += new System.Windows.Forms.DataGridViewCellValidatingEventHandler(this.EmpTable_CellValidating);
            this.EmpTable.Sorted += new System.EventHandler(this.EmpTable_Sorted);
            // 
            // colEmpRowID
            // 
            this.colEmpRowID.HeaderText = "ID";
            this.colEmpRowID.MinimumWidth = 8;
            this.colEmpRowID.Name = "colEmpRowID";
            this.colEmpRowID.Resizable = System.Windows.Forms.DataGridViewTriState.True;
            this.colEmpRowID.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.NotSortable;
            this.colEmpRowID.Visible = false;
            this.colEmpRowID.Width = 8;
            // 
            // colEmpID
            // 
            this.colEmpID.HeaderText = "Employee ID";
            this.colEmpID.MaxInputLength = 8;
            this.colEmpID.MinimumWidth = 8;
            this.colEmpID.Name = "colEmpID";
            this.colEmpID.Width = 150;
            // 
            // colName
            // 
            this.colName.HeaderText = "Name";
            this.colName.MinimumWidth = 8;
            this.colName.Name = "colName";
            this.colName.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.NotSortable;
            this.colName.Width = 150;
            // 
            // colDivision
            // 
            this.colDivision.HeaderText = "Division";
            this.colDivision.MinimumWidth = 8;
            this.colDivision.Name = "colDivision";
            this.colDivision.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.NotSortable;
            this.colDivision.Width = 150;
            // 
            // colRemark
            // 
            this.colRemark.HeaderText = "Remark";
            this.colRemark.MaxInputLength = 40;
            this.colRemark.MinimumWidth = 8;
            this.colRemark.Name = "colRemark";
            this.colRemark.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.NotSortable;
            this.colRemark.Width = 150;
            // 
            // numAddRows
            // 
            this.numAddRows.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.numAddRows.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.numAddRows.Location = new System.Drawing.Point(0, 0);
            this.numAddRows.Name = "numAddRows";
            this.numAddRows.Size = new System.Drawing.Size(60, 30);
            this.numAddRows.TabIndex = 131;
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label1.Location = new System.Drawing.Point(0, 0);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(109, 25);
            this.label1.TabIndex = 132;
            this.label1.Text = "No. of rows";
            // 
            // btnAddRows
            // 
            this.btnAddRows.Cursor = System.Windows.Forms.Cursors.Hand;
            this.btnAddRows.Image = ((System.Drawing.Image)(resources.GetObject("btnAddRows.Image")));
            this.btnAddRows.Location = new System.Drawing.Point(0, 0);
            this.btnAddRows.Name = "btnAddRows";
            this.btnAddRows.Size = new System.Drawing.Size(30, 30);
            this.btnAddRows.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
            this.btnAddRows.TabIndex = 133;
            this.btnAddRows.TabStop = false;
            this.btnAddRows.Click += new System.EventHandler(this.btnAddRows_Click);
            // 
            // btnSwitchTable
            // 
            this.btnSwitch.AutoSize = true;
            this.btnSwitch.BackColor = System.Drawing.SystemColors.ButtonFace;
            this.btnSwitch.Font = new System.Drawing.Font("Microsoft Sans Serif", 8F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnSwitch.Location = new System.Drawing.Point(24, 16);
            this.btnSwitch.Name = "btnSwitch";
            this.btnSwitch.Size = new System.Drawing.Size(186, 34);
            this.btnSwitch.TabIndex = 129;
            this.btnSwitch.Text = "Document Category";
            this.btnSwitch.UseVisualStyleBackColor = false;
            this.btnSwitch.Click += new System.EventHandler(this.btnSwitchTable_Click);
            // 
            // btnPrint
            // 
            this.btnPrint.BackColor = System.Drawing.SystemColors.ButtonFace;
            this.btnPrint.Font = new System.Drawing.Font("Microsoft Sans Serif", 8F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnPrint.Location = new System.Drawing.Point(826, 16);
            this.btnPrint.Name = "btnPrint";
            this.btnPrint.Size = new System.Drawing.Size(75, 34);
            this.btnPrint.TabIndex = 128;
            this.btnPrint.Text = "Print";
            this.btnPrint.UseVisualStyleBackColor = false;
            this.btnPrint.Click += new System.EventHandler(this.btnPrint_Click);
            // 
            // btnImport
            // 
            this.btnImport.BackColor = System.Drawing.SystemColors.ButtonFace;
            this.btnImport.Font = new System.Drawing.Font("Microsoft Sans Serif", 8F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnImport.Location = new System.Drawing.Point(700, 16);
            this.btnImport.Name = "btnImport";
            this.btnImport.Size = new System.Drawing.Size(75, 34);
            this.btnImport.TabIndex = 128;
            this.btnImport.Text = "Import";
            this.btnImport.UseVisualStyleBackColor = false;
            this.btnImport.Click += new System.EventHandler(this.btnImport_Click);
            // 
            // FormEmp
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(9F, 20F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.AutoSize = true;
            this.ClientSize = new System.Drawing.Size(940, 669);
            this.Controls.Add(this.PanelContainer);
            this.Name = "FormEmp";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Load += new System.EventHandler(this.FormEmp_Load);
            this.PanelContainer.Panel1.ResumeLayout(false);
            this.PanelContainer.Panel1.PerformLayout();
            this.PanelContainer.Panel2.ResumeLayout(false);
            this.PanelContainer.Panel2.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.PanelContainer)).EndInit();
            this.PanelContainer.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.EmpTable)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.numAddRows)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.btnAddRows)).EndInit();
            this.ResumeLayout(false);

        }

        #endregion
        private System.Windows.Forms.DataGridView EmpTable;
        private System.Windows.Forms.NumericUpDown numAddRows;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.PictureBox btnAddRows;
        private System.Windows.Forms.Button btnSwitch;
        private System.Windows.Forms.Button btnImport;
        private System.Windows.Forms.Button btnPrint;
        private DataGridViewTextBoxColumn colEmpRowID;
        private DataGridViewTextBoxColumn colEmpID;
        private DataGridViewTextBoxColumn colName;
        private DataGridViewComboBoxColumn colDivision;
        private DataGridViewTextBoxColumn colRemark;
    }
}