//using PresentationControls;
using System.Drawing;
using System;
using System.Windows.Forms;
using System.Windows.Forms.VisualStyles;

namespace AutomatedSmartCapture
{
    partial class FormDocCat
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
            this.DocCatTable = new System.Windows.Forms.DataGridView();
            this.colDocCatRowID = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colDocCat = new AutomatedSmartCapture.Controls.DataGridViewCheckBoxComboBoxWithFilterColumn();
            this.colQty = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.numAddRows = new System.Windows.Forms.NumericUpDown();
            this.label1 = new System.Windows.Forms.Label();
            this.btnAddRows = new System.Windows.Forms.PictureBox();
            this.btnSwitchTable = new System.Windows.Forms.Button();
            this.btnPrint = new System.Windows.Forms.Button();
            ((System.ComponentModel.ISupportInitialize)(this.PanelContainer)).BeginInit();
            this.PanelContainer.Panel1.SuspendLayout();
            this.PanelContainer.Panel2.SuspendLayout();
            this.PanelContainer.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.DocCatTable)).BeginInit();
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
            // 
            // PanelContainer.Panel1
            // 
            this.PanelContainer.Panel1.AutoScroll = true;
            this.PanelContainer.Panel1.BackgroundImageLayout = System.Windows.Forms.ImageLayout.None;
            this.PanelContainer.Panel1.Controls.Add(this.DocCatTable);
            this.PanelContainer.Panel1.Controls.Add(this.numAddRows);
            this.PanelContainer.Panel1.Controls.Add(this.label1);
            this.PanelContainer.Panel1.Controls.Add(this.btnAddRows);
            // 
            // PanelContainer.Panel2
            // 
            this.PanelContainer.Panel2.BackColor = System.Drawing.SystemColors.Window;
            this.PanelContainer.Panel2.BackgroundImageLayout = System.Windows.Forms.ImageLayout.None;
            this.PanelContainer.Panel2.Controls.Add(this.btnSwitchTable);
            this.PanelContainer.Panel2.Controls.Add(this.btnPrint);
            this.PanelContainer.Size = new System.Drawing.Size(948, 669);
            this.PanelContainer.SplitterDistance = 600;
            this.PanelContainer.SplitterWidth = 1;
            this.PanelContainer.TabIndex = 130;
            // 
            // DocCatTable
            // 
            this.DocCatTable.AllowUserToAddRows = false;
            this.DocCatTable.AutoSize = true;
            this.DocCatTable.BackgroundColor = System.Drawing.SystemColors.Control;
            this.DocCatTable.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.DocCatTable.CellBorderStyle = System.Windows.Forms.DataGridViewCellBorderStyle.Sunken;
            this.DocCatTable.ColumnHeadersBorderStyle = System.Windows.Forms.DataGridViewHeaderBorderStyle.Single;
            dataGridViewCellStyle1.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleCenter;
            dataGridViewCellStyle1.BackColor = System.Drawing.Color.LightGray;
            dataGridViewCellStyle1.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            dataGridViewCellStyle1.ForeColor = System.Drawing.SystemColors.GrayText;
            dataGridViewCellStyle1.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle1.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle1.WrapMode = System.Windows.Forms.DataGridViewTriState.True;
            this.DocCatTable.ColumnHeadersDefaultCellStyle = dataGridViewCellStyle1;
            this.DocCatTable.ColumnHeadersHeight = 30;
            this.DocCatTable.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
            this.colDocCatRowID,
            this.colDocCat,
            this.colQty});
            dataGridViewCellStyle2.Alignment = System.Windows.Forms.DataGridViewContentAlignment.MiddleLeft;
            dataGridViewCellStyle2.BackColor = System.Drawing.SystemColors.ControlLightLight;
            dataGridViewCellStyle2.Font = new System.Drawing.Font("Microsoft Sans Serif", 8F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            dataGridViewCellStyle2.ForeColor = System.Drawing.SystemColors.ControlText;
            dataGridViewCellStyle2.SelectionBackColor = System.Drawing.SystemColors.Highlight;
            dataGridViewCellStyle2.SelectionForeColor = System.Drawing.SystemColors.HighlightText;
            dataGridViewCellStyle2.WrapMode = System.Windows.Forms.DataGridViewTriState.False;
            this.DocCatTable.DefaultCellStyle = dataGridViewCellStyle2;
            this.DocCatTable.EnableHeadersVisualStyles = false;
            this.DocCatTable.GridColor = System.Drawing.SystemColors.Control;
            this.DocCatTable.Location = new System.Drawing.Point(4, 6);
            this.DocCatTable.Name = "DocCatTable";
            this.DocCatTable.RowHeadersVisible = false;
            this.DocCatTable.RowHeadersWidth = 62;
            this.DocCatTable.RowTemplate.Height = 28;
            this.DocCatTable.ScrollBars = System.Windows.Forms.ScrollBars.None;
            this.DocCatTable.Size = new System.Drawing.Size(466, 150);
            this.DocCatTable.TabIndex = 134;
            this.DocCatTable.CellValidating += new System.Windows.Forms.DataGridViewCellValidatingEventHandler(this.DocCatTable_CellValidating);
            // 
            // colDocCatRowID
            // 
            this.colDocCatRowID.HeaderText = "ID";
            this.colDocCatRowID.MinimumWidth = 8;
            this.colDocCatRowID.Name = "colDocCatRowID";
            this.colDocCatRowID.Resizable = System.Windows.Forms.DataGridViewTriState.True;
            this.colDocCatRowID.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.NotSortable;
            this.colDocCatRowID.Visible = false;
            this.colDocCatRowID.Width = 8;
            // 
            // colDocCat
            // 
            this.colDocCat.HeaderText = "Document Category";
            this.colDocCat.MinimumWidth = 8;
            this.colDocCat.Name = "colDocCat";
            this.colDocCat.Width = 300;
            // 
            // colQty
            // 
            this.colQty.HeaderText = "Quantity";
            this.colQty.MinimumWidth = 8;
            this.colQty.Name = "colQty";
            this.colQty.SortMode = System.Windows.Forms.DataGridViewColumnSortMode.NotSortable;
            this.colQty.Width = 150;
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
            this.btnSwitchTable.AutoSize = true;
            this.btnSwitchTable.BackColor = System.Drawing.SystemColors.ButtonFace;
            this.btnSwitchTable.Font = new System.Drawing.Font("Microsoft Sans Serif", 8F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnSwitchTable.Location = new System.Drawing.Point(24, 16);
            this.btnSwitchTable.Name = "btnSwitchTable";
            this.btnSwitchTable.Size = new System.Drawing.Size(186, 34);
            this.btnSwitchTable.TabIndex = 129;
            this.btnSwitchTable.Text = "Employee ID";
            this.btnSwitchTable.UseVisualStyleBackColor = false;
            this.btnSwitchTable.Click += new System.EventHandler(this.btnSwitchTable_Click);
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
            // FormDocCat
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(9F, 20F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.AutoSize = true;
            this.ClientSize = new System.Drawing.Size(940, 669);
            this.Controls.Add(this.PanelContainer);
            this.Name = "FormDocCat";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Load += new System.EventHandler(this.FormDocCat_Load);
            this.PanelContainer.Panel1.ResumeLayout(false);
            this.PanelContainer.Panel1.PerformLayout();
            this.PanelContainer.Panel2.ResumeLayout(false);
            this.PanelContainer.Panel2.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.PanelContainer)).EndInit();
            this.PanelContainer.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.DocCatTable)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.numAddRows)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.btnAddRows)).EndInit();
            this.ResumeLayout(false);

        }

        #endregion
        private System.Windows.Forms.DataGridView DocCatTable;
        private System.Windows.Forms.NumericUpDown numAddRows;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.PictureBox btnAddRows;
        private System.Windows.Forms.Button btnSwitchTable;
        private System.Windows.Forms.Button btnPrint;
        private System.Windows.Forms.DataGridViewTextBoxColumn colDocCatRowID;
        private AutomatedSmartCapture.Controls.DataGridViewCheckBoxComboBoxWithFilterColumn colDocCat;
        private System.Windows.Forms.DataGridViewTextBoxColumn colQty;
    }
}