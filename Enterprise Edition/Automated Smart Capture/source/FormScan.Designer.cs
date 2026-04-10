namespace AutomatedSmartCapture
{
    partial class FormScan
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(FormScan));
            this.pbScannedImg = new System.Windows.Forms.PictureBox();
            this.btnScan = new System.Windows.Forms.Button();
            this.btnStop = new System.Windows.Forms.Button();
            this.btnUpload = new System.Windows.Forms.Button();
            this.lbScanners = new System.Windows.Forms.ListBox();
            this.label1 = new System.Windows.Forms.Label();
            this.label2 = new System.Windows.Forms.Label();
            this.btnDelPage = new System.Windows.Forms.Button();
            this.btnImport = new System.Windows.Forms.Button();
            this.label6 = new System.Windows.Forms.Label();
            this.cbPageConfig = new System.Windows.Forms.ComboBox();
            this.btnConfig = new System.Windows.Forms.Button();
            this.panel1 = new System.Windows.Forms.Panel();
            this.labelStatus = new System.Windows.Forms.Label();
            this.label4 = new System.Windows.Forms.Label();
            this.tvDocs = new System.Windows.Forms.TreeView();
            this.btnRotate = new System.Windows.Forms.Button();
            this.btnZoomIn = new System.Windows.Forms.Button();
            this.btnZoomOut = new System.Windows.Forms.Button();
            ((System.ComponentModel.ISupportInitialize)(this.pbScannedImg)).BeginInit();
            this.panel1.SuspendLayout();
            this.SuspendLayout();
            // 
            // pbScannedImg
            // 
            this.pbScannedImg.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.pbScannedImg.Enabled = false;
            this.pbScannedImg.Location = new System.Drawing.Point(294, 71);
            this.pbScannedImg.Margin = new System.Windows.Forms.Padding(6, 7, 6, 7);
            this.pbScannedImg.Name = "pbScannedImg";
            this.pbScannedImg.Size = new System.Drawing.Size(535, 384);
            this.pbScannedImg.TabIndex = 0;
            this.pbScannedImg.TabStop = false;
            this.pbScannedImg.EnabledChanged += new System.EventHandler(this.pbScannedImg_EnabledChanged);
            // 
            // btnScan
            // 
            this.btnScan.Font = new System.Drawing.Font("Arial Narrow", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnScan.Location = new System.Drawing.Point(457, 24);
            this.btnScan.Margin = new System.Windows.Forms.Padding(6, 7, 6, 7);
            this.btnScan.Name = "btnScan";
            this.btnScan.Size = new System.Drawing.Size(281, 36);
            this.btnScan.TabIndex = 1;
            this.btnScan.Text = "Scan";
            this.btnScan.UseVisualStyleBackColor = true;
            this.btnScan.Click += new System.EventHandler(this.btnScan_Click);
            // 
            // btnStop
            // 
            this.btnStop.Font = new System.Drawing.Font("Arial Narrow", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnStop.Location = new System.Drawing.Point(750, 24);
            this.btnStop.Margin = new System.Windows.Forms.Padding(6, 7, 6, 7);
            this.btnStop.Name = "btnStop";
            this.btnStop.Size = new System.Drawing.Size(74, 36);
            this.btnStop.TabIndex = 7;
            this.btnStop.Text = "Stop";
            this.btnStop.UseVisualStyleBackColor = true;
            this.btnStop.Click += new System.EventHandler(this.btnStop_Click);
            // 
            // btnUpload
            // 
            this.btnUpload.BackColor = System.Drawing.Color.LimeGreen;
            this.btnUpload.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnUpload.Location = new System.Drawing.Point(752, 8);
            this.btnUpload.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.btnUpload.Name = "btnUpload";
            this.btnUpload.Size = new System.Drawing.Size(72, 29);
            this.btnUpload.TabIndex = 8;
            this.btnUpload.Text = "Upload";
            this.btnUpload.UseVisualStyleBackColor = false;
            this.btnUpload.EnabledChanged += new System.EventHandler(this.btnUpload_EnabledChanged);
            this.btnUpload.Click += new System.EventHandler(this.btnUpload_Click);
            // 
            // lbScanners
            // 
            this.lbScanners.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lbScanners.FormattingEnabled = true;
            this.lbScanners.IntegralHeight = false;
            this.lbScanners.ItemHeight = 16;
            this.lbScanners.Location = new System.Drawing.Point(14, 24);
            this.lbScanners.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.lbScanners.Name = "lbScanners";
            this.lbScanners.Size = new System.Drawing.Size(269, 84);
            this.lbScanners.TabIndex = 9;
            this.lbScanners.SelectedIndexChanged += new System.EventHandler(this.lbScanners_SelectedIndexChanged);
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Font = new System.Drawing.Font("Arial Narrow", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label1.Location = new System.Drawing.Point(14, 9);
            this.label1.Margin = new System.Windows.Forms.Padding(5, 0, 5, 0);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(53, 17);
            this.label1.TabIndex = 11;
            this.label1.Text = "Scanner:";
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.Font = new System.Drawing.Font("Arial Narrow", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label2.Location = new System.Drawing.Point(14, 112);
            this.label2.Margin = new System.Windows.Forms.Padding(5, 0, 5, 0);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(67, 17);
            this.label2.TabIndex = 12;
            this.label2.Text = "Documents:";
            // 
            // btnDelPage
            // 
            this.btnDelPage.BackColor = System.Drawing.Color.Gold;
            this.btnDelPage.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnDelPage.ForeColor = System.Drawing.SystemColors.ControlText;
            this.btnDelPage.Location = new System.Drawing.Point(538, 8);
            this.btnDelPage.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.btnDelPage.Name = "btnDelPage";
            this.btnDelPage.Size = new System.Drawing.Size(118, 29);
            this.btnDelPage.TabIndex = 13;
            this.btnDelPage.Text = "Delete Page";
            this.btnDelPage.UseVisualStyleBackColor = false;
            this.btnDelPage.EnabledChanged += new System.EventHandler(this.btnDelPage_EnabledChanged);
            this.btnDelPage.Click += new System.EventHandler(this.btnDelPage_Click);
            // 
            // btnImport
            // 
            this.btnImport.BackColor = System.Drawing.Color.SkyBlue;
            this.btnImport.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnImport.ForeColor = System.Drawing.SystemColors.ControlText;
            this.btnImport.Location = new System.Drawing.Point(672, 8);
            this.btnImport.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.btnImport.Name = "btnImport";
            this.btnImport.Size = new System.Drawing.Size(66, 29);
            this.btnImport.TabIndex = 20;
            this.btnImport.Text = "Import";
            this.btnImport.UseVisualStyleBackColor = false;
            this.btnImport.EnabledChanged += new System.EventHandler(this.btnImport_EnabledChanged);
            this.btnImport.Click += new System.EventHandler(this.btnImport_Click);
            // 
            // label6
            // 
            this.label6.AutoSize = true;
            this.label6.Font = new System.Drawing.Font("Arial Narrow", 10F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label6.Location = new System.Drawing.Point(290, 11);
            this.label6.Margin = new System.Windows.Forms.Padding(6, 0, 6, 0);
            this.label6.Name = "label6";
            this.label6.Size = new System.Drawing.Size(116, 17);
            this.label6.TabIndex = 21;
            this.label6.Text = "Page Configuration:";
            // 
            // cbPageConfig
            // 
            this.cbPageConfig.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cbPageConfig.FormattingEnabled = true;
            this.cbPageConfig.Items.AddRange(new object[] {
            "Double Sides",
            "Single Side"});
            this.cbPageConfig.Location = new System.Drawing.Point(294, 32);
            this.cbPageConfig.Margin = new System.Windows.Forms.Padding(6, 7, 6, 7);
            this.cbPageConfig.Name = "cbPageConfig";
            this.cbPageConfig.Size = new System.Drawing.Size(151, 24);
            this.cbPageConfig.TabIndex = 22;
            this.cbPageConfig.SelectedIndexChanged += new System.EventHandler(this.cbPageConfig_SelectedIndexChanged);
            // 
            // btnConfig
            // 
            this.btnConfig.FlatStyle = System.Windows.Forms.FlatStyle.System;
            this.btnConfig.Font = new System.Drawing.Font("Arial", 10F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnConfig.Location = new System.Drawing.Point(18, 71);
            this.btnConfig.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.btnConfig.Name = "btnConfig";
            this.btnConfig.Size = new System.Drawing.Size(149, 31);
            this.btnConfig.TabIndex = 27;
            this.btnConfig.Text = "Configuration";
            this.btnConfig.UseMnemonic = false;
            this.btnConfig.UseVisualStyleBackColor = true;
            this.btnConfig.Visible = false;
            this.btnConfig.Click += new System.EventHandler(this.btnConfig_Click);
            // 
            // panel1
            // 
            this.panel1.BackColor = System.Drawing.Color.White;
            this.panel1.Controls.Add(this.labelStatus);
            this.panel1.Controls.Add(this.btnDelPage);
            this.panel1.Controls.Add(this.btnImport);
            this.panel1.Controls.Add(this.btnUpload);
            this.panel1.Controls.Add(this.label4);
            this.panel1.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.panel1.Location = new System.Drawing.Point(0, 509);
            this.panel1.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.panel1.Name = "panel1";
            this.panel1.Size = new System.Drawing.Size(841, 46);
            this.panel1.TabIndex = 28;
            // 
            // labelStatus
            // 
            this.labelStatus.AutoSize = true;
            this.labelStatus.Font = new System.Drawing.Font("Microsoft Sans Serif", 12F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.labelStatus.Location = new System.Drawing.Point(70, 11);
            this.labelStatus.Name = "labelStatus";
            this.labelStatus.Size = new System.Drawing.Size(0, 20);
            this.labelStatus.TabIndex = 33;
            // 
            // label4
            // 
            this.label4.AutoSize = true;
            this.label4.Font = new System.Drawing.Font("Microsoft Sans Serif", 10.2F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.label4.Location = new System.Drawing.Point(14, 13);
            this.label4.Name = "label4";
            this.label4.Size = new System.Drawing.Size(59, 17);
            this.label4.TabIndex = 32;
            this.label4.Text = "Status:";
            // 
            // tvDocs
            // 
            this.tvDocs.AllowDrop = true;
            this.tvDocs.Indent = 40;
            this.tvDocs.Location = new System.Drawing.Point(14, 128);
            this.tvDocs.Margin = new System.Windows.Forms.Padding(5, 4, 5, 4);
            this.tvDocs.Name = "tvDocs";
            this.tvDocs.PathSeparator = "-";
            this.tvDocs.Size = new System.Drawing.Size(269, 370);
            this.tvDocs.TabIndex = 29;
            this.tvDocs.ItemDrag += new System.Windows.Forms.ItemDragEventHandler(this.tvDocs_ItemDrag);
            this.tvDocs.AfterSelect += new System.Windows.Forms.TreeViewEventHandler(this.tvDocs_AfterSelect);
            this.tvDocs.NodeMouseDoubleClick += new System.Windows.Forms.TreeNodeMouseClickEventHandler(this.tvDocs_NodeMouseDoubleClick);
            this.tvDocs.DragDrop += new System.Windows.Forms.DragEventHandler(this.tvDocs_DragDrop);
            this.tvDocs.DragOver += new System.Windows.Forms.DragEventHandler(this.tvDocs_DragOver);
            this.tvDocs.MouseDown += new System.Windows.Forms.MouseEventHandler(this.tvDocs_MouseDown);
            // 
            // btnRotate
            // 
            this.btnRotate.Enabled = false;
            this.btnRotate.Location = new System.Drawing.Point(366, 465);
            this.btnRotate.Name = "btnRotate";
            this.btnRotate.Size = new System.Drawing.Size(94, 33);
            this.btnRotate.TabIndex = 30;
            this.btnRotate.Text = "Rotate";
            this.btnRotate.UseVisualStyleBackColor = true;
            this.btnRotate.Click += new System.EventHandler(this.btnRotate_Click);
            // 
            // btnZoomIn
            // 
            this.btnZoomIn.Enabled = false;
            this.btnZoomIn.Location = new System.Drawing.Point(482, 465);
            this.btnZoomIn.Name = "btnZoomIn";
            this.btnZoomIn.Size = new System.Drawing.Size(98, 33);
            this.btnZoomIn.TabIndex = 31;
            this.btnZoomIn.Text = "Zoom In";
            this.btnZoomIn.UseVisualStyleBackColor = true;
            this.btnZoomIn.Click += new System.EventHandler(this.btnZoomIn_Click);
            // 
            // btnZoomOut
            // 
            this.btnZoomOut.Enabled = false;
            this.btnZoomOut.Location = new System.Drawing.Point(598, 465);
            this.btnZoomOut.Name = "btnZoomOut";
            this.btnZoomOut.Size = new System.Drawing.Size(103, 33);
            this.btnZoomOut.TabIndex = 32;
            this.btnZoomOut.Text = "Zoom Out";
            this.btnZoomOut.UseVisualStyleBackColor = true;
            this.btnZoomOut.Click += new System.EventHandler(this.btnZoomOut_Click);
            // 
            // FormScan
            // 
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.None;
            this.AutoSizeMode = System.Windows.Forms.AutoSizeMode.GrowAndShrink;
            this.ClientSize = new System.Drawing.Size(841, 555);
            this.Controls.Add(this.btnZoomOut);
            this.Controls.Add(this.btnZoomIn);
            this.Controls.Add(this.btnRotate);
            this.Controls.Add(this.btnConfig);
            this.Controls.Add(this.lbScanners);
            this.Controls.Add(this.tvDocs);
            this.Controls.Add(this.panel1);
            this.Controls.Add(this.cbPageConfig);
            this.Controls.Add(this.label6);
            this.Controls.Add(this.label2);
            this.Controls.Add(this.label1);
            this.Controls.Add(this.btnStop);
            this.Controls.Add(this.btnScan);
            this.Controls.Add(this.pbScannedImg);
            this.Font = new System.Drawing.Font("Microsoft Sans Serif", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.Margin = new System.Windows.Forms.Padding(6, 7, 6, 7);
            this.Name = "FormScan";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Load += new System.EventHandler(this.FormScan_Load);
            this.Shown += new System.EventHandler(this.FormScan_Shown);
            this.Resize += new System.EventHandler(this.FormScan_Resize);
            ((System.ComponentModel.ISupportInitialize)(this.pbScannedImg)).EndInit();
            this.panel1.ResumeLayout(false);
            this.panel1.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private System.Windows.Forms.PictureBox pbScannedImg;
        private System.Windows.Forms.Button btnScan;
        private System.Windows.Forms.Button btnStop;
        private System.Windows.Forms.Button btnUpload;
        private System.Windows.Forms.ListBox lbScanners;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.Button btnDelPage;
        private System.Windows.Forms.Button btnImport;
        private System.Windows.Forms.Label label6;
        private System.Windows.Forms.ComboBox cbPageConfig;
        private System.Windows.Forms.Button btnConfig;
        private System.Windows.Forms.Panel panel1;
        private System.Windows.Forms.TreeView tvDocs;
        private System.Windows.Forms.Label label4;
        private System.Windows.Forms.Label labelStatus;
        private System.Windows.Forms.Button btnRotate;
        private System.Windows.Forms.Button btnZoomIn;
        private System.Windows.Forms.Button btnZoomOut;
    }
}