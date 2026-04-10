using System;
using System.Collections;
using System.Configuration;
using System.Collections.Generic;
namespace ExportTools
{
    public class SysParameters
    {
        private static bool firstInstanceID = true;
        private static string SysInstanceID;
        public static string InstanceID
        {
            get
            {
                if (firstInstanceID == true)
                {
                    Configuration configuration = ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);
                    SysInstanceID = configuration.AppSettings.Settings["InstanceID"].Value;
                    firstInstanceID = false;
                }
                return SysInstanceID;
            }
            set
            {
                Configuration configuration = ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);
                configuration.AppSettings.Settings["InstanceID"].Value = value.ToString();
                SysInstanceID = value;
                configuration.Save();
            }
        }

        public static int BatchID
        {
            get;
            set;
        }



    }
}
