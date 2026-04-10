namespace AutomatedSmartCapture
{
    partial class FormMain
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
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.btnQRCodePrint = new System.Windows.Forms.Button();
            this.btnCapture = new System.Windows.Forms.Button();
            this.timer1 = new System.Windows.Forms.Timer(this.components);
            this.bwTokenValidator = new System.ComponentModel.BackgroundWorker();
            this.SuspendLayout();
            // 
            // btnQRCodePrint
            // 
            this.btnQRCodePrint.Font = new System.Drawing.Font("Microsoft Sans Serif", 14F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnQRCodePrint.Location = new System.Drawing.Point(77, 48);
            this.btnQRCodePrint.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.btnQRCodePrint.Name = "btnQRCodePrint";
            this.btnQRCodePrint.Size = new System.Drawing.Size(153, 118);
            this.btnQRCodePrint.TabIndex = 0;
            this.btnQRCodePrint.Text = "QR Code Printing Center";
            this.btnQRCodePrint.UseVisualStyleBackColor = true;
            this.btnQRCodePrint.Click += new System.EventHandler(this.btnQRCodePrint_Click);
            // 
            // btnCapture
            // 
            this.btnCapture.Font = new System.Drawing.Font("Microsoft Sans Serif", 14F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.btnCapture.Location = new System.Drawing.Point(286, 48);
            this.btnCapture.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.btnCapture.Name = "btnCapture";
            this.btnCapture.Size = new System.Drawing.Size(153, 118);
            this.btnCapture.TabIndex = 1;
            this.btnCapture.Text = "Capturing Center";
            this.btnCapture.UseVisualStyleBackColor = true;
            this.btnCapture.Click += new System.EventHandler(this.btnCapture_Click);
            // 
            // timer1
            // 
            this.timer1.Tick += new System.EventHandler(this.timer1_Tick);
            // 
            // bwTokenValidator
            // 
            this.bwTokenValidator.DoWork += new System.ComponentModel.DoWorkEventHandler(this.bwTokenValidator_DoWork);
            // 
            // FormMain
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(8F, 16F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(511, 226);
            this.Controls.Add(this.btnCapture);
            this.Controls.Add(this.btnQRCodePrint);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.HelpButton = true;
            this.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.MaximizeBox = false;
            this.Name = "FormMain";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Load += new System.EventHandler(this.FormMain_Load);
            this.Shown += new System.EventHandler(this.FormMain_Shown);
            this.MouseMove += new System.Windows.Forms.MouseEventHandler(this.FormMain_MouseMove);
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Button btnQRCodePrint;
        private System.Windows.Forms.Button btnCapture;
        private System.Windows.Forms.Timer timer1;
        private System.ComponentModel.BackgroundWorker bwTokenValidator;
    }
}