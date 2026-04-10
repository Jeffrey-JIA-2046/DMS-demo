using PresentationControls;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;

namespace AutomatedSmartCapture.Controls
{
    public class CheckBoxComboBoxWithFilter : CheckBoxComboBox
    {
        public TextBox FilterBox;
        public CheckBoxComboBoxListControl ListControl;
        internal object FullDataSource { get; set; }

        public CheckBoxComboBoxWithFilter() : base()
        {
            FilterBox = new TextBox();
            FilterBox.Dock = DockStyle.Top;
            FilterBox.Font = new Font(FilterBox.Font, FontStyle.Italic);
            FilterBox.ForeColor = Color.Gray;
            FilterBox.Text = "Filter";
            FilterBox.GotFocus += new EventHandler(this.FilterBox_GotFocus);
            FilterBox.LostFocus += new EventHandler(this.FilterBox_LostFocus);
            FilterBox.TextChanged += new EventHandler(this.FilterBox_TextChanged);
            DropDownControl.Controls.Add(FilterBox);

            ListControl = (CheckBoxComboBoxListControl)DropDownControl.Controls[0];
            ListControl.Dock = DockStyle.Bottom;
            ListControl.Padding = new Padding(8, 0, 0, 0);
            ListControl.Size = new Size(DropDownControl.Width, DropDownControl.Height - FilterBox.Height - 5);

            this.DropDownControl.Padding = new Padding(0);
            this.dropDown.Resizable = false;

            this.FullDataSource = DataSource;
        }

        private void FilterBox_GotFocus(object sender, EventArgs e)
        {
            if (FilterBox.Text == "Filter" & FilterBox.Font.Style == FontStyle.Italic)
            {
                FilterBox.Enabled = false;
                FilterBox.Clear();

                FilterBox.Font = new Font(FilterBox.Font, FontStyle.Regular);
                FilterBox.ForeColor = Color.Black;
                FilterBox.Enabled = true;
            }
        }

        private void FilterBox_LostFocus(object sender, EventArgs e)
        {
            if (FilterBox.Text == String.Empty)
            {
                FilterBox.Enabled = false;
                FilterBox.Font = new Font(FilterBox.Font, FontStyle.Italic);
                FilterBox.ForeColor = Color.Gray;
                FilterBox.Text = "Filter";

                FilterBox.Enabled = true;
            }
        }

        private void FilterBox_TextChanged(object sender, EventArgs e)
        {
            if (!FilterBox.Enabled)
            {
                return;
            }

            if (FilterBox.Text == String.Empty)
            {
                FilterBox.Enabled = false;
                FilterBox.Font = new Font(FilterBox.Font, FontStyle.Italic);
                FilterBox.ForeColor = Color.Gray;
                FilterBox.Text = "Filter";

                FilterBox.Enabled = true;
                DataSource = FullDataSource;
            }
            else
            {
                FilterBox.Font = new Font(FilterBox.Font, FontStyle.Regular);
                FilterBox.ForeColor = Color.Black;

                List<string> rawDataSource = (FullDataSource as ListSelectionWrapper<string>).Select(wrapper => wrapper.Item).ToList();
                DataSource = new ListSelectionWrapper<string>(rawDataSource.Where(item => item.Contains(FilterBox.Text)));
            }
        }
    }

    public class DataGridViewCheckBoxComboBoxWithFilterColumn : DataGridViewCheckBoxComboBoxColumn
    {
        public DataGridViewCheckBoxComboBoxWithFilterColumn() : base()
        {
            this.CellTemplate = new DataGridViewCheckBoxComboBoxWithFilterCell();
        }

        public class DataGridViewCheckBoxComboBoxWithFilterCell : DataGridViewCheckBoxComboBoxCell
        {
            //protected override object GetFormattedValue(object value, int rowIndex, ref DataGridViewCellStyle cellStyle, TypeConverter valueTypeConverter, TypeConverter formattedValueTypeConverter, DataGridViewDataErrorContexts context)
            public override void InitializeEditingControl(int rowIndex, object initialFormattedValue, DataGridViewCellStyle dataGridViewCellStyle)
            {
                //DataGridViewComboBoxCell thisBase = this as DataGridViewComboBoxCell;
                base.InitializeEditingControl(rowIndex, initialFormattedValue, dataGridViewCellStyle);

                DataGridViewCheckBoxComboBoxWithFilterControl control = this.DataGridView.EditingControl as DataGridViewCheckBoxComboBoxWithFilterControl;
                DataGridViewCheckBoxComboBoxWithFilterColumn config = this.OwningColumn as DataGridViewCheckBoxComboBoxWithFilterColumn;
                control.FullDataSource = config.DataSource;
                control.DisplayMemberSingleItem = config.DisplayMemberSingleItem;
                control.TextSeparator = config.TextSeparator;

                foreach (CheckBoxComboBoxItem item in control.CheckBoxItems)
                    item.Checked = false;

                if (this.Value != Convert.DBNull)
                {
                    Dictionary<String, Object> values = this.Value as Dictionary<String, Object>;

                    foreach (String key in values.Keys)
                        control.CheckBoxItems[key].Checked = true;
                }

                control.BeginInvoke(new MethodInvoker(control.ShowDropDown));
            }

            public override Type EditType
            {
                get { return typeof(DataGridViewCheckBoxComboBoxWithFilterControl); }
            }
        }

        private class DataGridViewCheckBoxComboBoxWithFilterControl : DataGridViewCheckBoxComboBoxControl
        {
            private CheckBoxComboBoxWithFilter RawControl;

            public TextBox FilterBox { get; set; }
            public CheckBoxComboBoxListControl ListControl { get; set; }

            public object FullDataSource { 
                get { return RawControl.FullDataSource; }
                set { RawControl.FullDataSource = value; }
            }

            public DataGridViewCheckBoxComboBoxWithFilterControl() : base()
            {
                RawControl = new CheckBoxComboBoxWithFilter();

                ListControl = (CheckBoxComboBoxListControl)this.DropDownControl.Controls[0];
                ListControl.Padding = new Padding(8, 0, 0, 0);
                ListControl.Size = new Size(DropDownControl.Width, DropDownControl.Height - RawControl.FilterBox.Height - 5);

                FilterBox = RawControl.FilterBox;
                FilterBox.TextChanged += new EventHandler(this.FilterBox_TextChanged);
                this.DropDownControl.Controls.Add(FilterBox);

                //var rawListControl = RawControl.ListControl;
                //rawListControl.Padding = new Padding(4, 0, 0, 0);
                //rawListControl.Size = new Size(DropDownControl.Width, DropDownControl.Height - RawControl.FilterBox.Height - 5);
                //this.DropDownControl.Controls.Add(rawListControl);

                this.DropDownControl.Padding = new Padding(0);
                this.dropDown.Resizable = false;
                //MessageBox.Show(ListControl.Bounds.ToString());
                //MessageBox.Show(DropDownControl.Controls[1].Bounds.ToString());
                //MessageBox.Show(DropDownControl.Controls[2].Bounds.ToString());
            }

            private void FilterBox_TextChanged(object sender, EventArgs e)
            {
                if (FilterBox.Text == "Filter")
                {
                    DataSource = FullDataSource;
                }
                else
                {
                    List<string> rawDataSource = (FullDataSource as ListSelectionWrapper<string>).Select(wrapper => wrapper.Item).ToList();
                    DataSource = new ListSelectionWrapper<string>(rawDataSource.Where(item => item.ToLowerInvariant().Contains(FilterBox.Text.ToLowerInvariant())));
                }
            }
        }
    }
}
