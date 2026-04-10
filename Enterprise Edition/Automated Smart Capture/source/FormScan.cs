///////////////////////////////////////////////////////////////////////////////////////
//
// AutomatedSmartCapture.FormScan
//
// This is the main class for the application.  We're showing how to select and
// load a TWAIN driver.  How to configure it for a scan session, and how to capture
// and display images.
//
// This (moreso than then TWAINCSTst) is designed to be a possible template for
// developers looking to add TWAIN to their C# applications.  It's small, and it's
// focused on the tasks needed to capture image data.
//
///////////////////////////////////////////////////////////////////////////////////////
//  Author          Date            Version     Comment
//  M.McLaughlin    21-May-2014     2.0.0.0     64-bit Linux
//  M.McLaughlin    27-Feb-2014     1.1.0.0     ShowImage additions
//  M.McLaughlin    21-Oct-2013     1.0.0.0     Initial Release
///////////////////////////////////////////////////////////////////////////////////////
//  Copyright (C) 2013-2019 Kodak Alaris Inc.
//
//  Permission is hereby granted, free of charge, to any person obtaining a
//  copy of this software and associated documentation files (the "Software"),
//  to deal in the Software without restriction, including without limitation
//  the rights to use, copy, modify, merge, publish, distribute, sublicense,
//  and/or sell copies of the Software, and to permit persons to whom the
//  Software is furnished to do so, subject to the following conditions:
//
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
//  THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//  DEALINGS IN THE SOFTWARE.
///////////////////////////////////////////////////////////////////////////////////////

using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Permissions;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

using TWAINWorkingGroup;
using AutomatedSmartCapture.Model;
using AutomatedSmartCapture.Util;
using AutomatedSmartCapture.Controls;

using IronPdf;
using iTextSharp.text.pdf;
using Newtonsoft.Json.Linq;
using ZXing;
using ZXing.Common;

using iTextImage = iTextSharp.text.Image;
using iTextDoc = iTextSharp.text.Document;
using iTextRect = iTextSharp.text.Rectangle;
using PixelFormat = System.Drawing.Imaging.PixelFormat;

namespace AutomatedSmartCapture
{
    /// <summary>
    /// Our mainform for this application.
    /// </summary>
    public partial class FormScan : Form, IMessageFilter
    {
        private CmsUtil _cms { get { return Program.Cms; } }

        private sealed class NaturalTreeNodeComparer : IComparer
        {
            public int Compare(object x, object y)
            {
                var leftNode = x as TreeNode;
                var rightNode = y as TreeNode;

                string left = leftNode?.Text ?? string.Empty;
                string right = rightNode?.Text ?? string.Empty;

                return CompareNatural(left, right);
            }

            private static int CompareNatural(string left, string right)
            {
                if (ReferenceEquals(left, right))
                {
                    return 0;
                }

                if (left is null)
                {
                    return -1;
                }

                if (right is null)
                {
                    return 1;
                }

                int i = 0;
                int j = 0;

                while (i < left.Length && j < right.Length)
                {
                    bool leftDigit = char.IsDigit(left[i]);
                    bool rightDigit = char.IsDigit(right[j]);

                    if (leftDigit && rightDigit)
                    {
                        int leftStart = i;
                        int rightStart = j;

                        while (leftStart < left.Length && left[leftStart] == '0') leftStart++;
                        while (rightStart < right.Length && right[rightStart] == '0') rightStart++;

                        int leftEnd = leftStart;
                        int rightEnd = rightStart;

                        while (leftEnd < left.Length && char.IsDigit(left[leftEnd])) leftEnd++;
                        while (rightEnd < right.Length && char.IsDigit(right[rightEnd])) rightEnd++;

                        int leftLength = leftEnd - leftStart;
                        int rightLength = rightEnd - rightStart;

                        if (leftLength != rightLength)
                        {
                            return leftLength.CompareTo(rightLength);
                        }

                        for (int index = 0; index < leftLength; index++)
                        {
                            int digitCompare = left[leftStart + index].CompareTo(right[rightStart + index]);
                            if (digitCompare != 0)
                            {
                                return digitCompare;
                            }
                        }

                        int leftRunLength = leftEnd - i;
                        int rightRunLength = rightEnd - j;
                        if (leftRunLength != rightRunLength)
                        {
                            return leftRunLength.CompareTo(rightRunLength);
                        }

                        i = leftEnd;
                        j = rightEnd;
                        continue;
                    }

                    int charCompare = char.ToUpperInvariant(left[i]).CompareTo(char.ToUpperInvariant(right[j]));
                    if (charCompare != 0)
                    {
                        return charCompare;
                    }

                    i++;
                    j++;
                }

                return left.Length.CompareTo(right.Length);
            }
        }

        ///////////////////////////////////////////////////////////////////////////////
        // Public Methods
        ///////////////////////////////////////////////////////////////////////////////
        #region Public Methods

        /// <summary>
        /// Our constructor.
        /// </summary>
        public FormScan(FormMain main)
        {
            this.Owner = main;
            this.Icon = main.Icon;
            this.Text = String.Format("{0} - Capturing Center", main.Text);
            
            // Build our form
            InitializeComponent();
            tvDocs.TreeViewNodeSorter = new NaturalTreeNodeComparer();

            // Open the log in our working folder, and say hi
            TWAINWorkingGroup.Log.Open("AutomatedSmartCapture", ".", 1);
            TWAINWorkingGroup.Log.Info("AutomatedSmartCapture v" + System.Reflection.Assembly.GetEntryAssembly().GetName().Version.ToString());

            // Init other stuff
            m_blIndicators = true;
            m_blExit = false;
            //m_iUseBitmap = 0;
            this.FormClosing += new FormClosingEventHandler(FormScan_FormClosing);

            // Create our image capture object
            try
            {
                // Init stuff
                TWAIN.DeviceEventCallback deviceeventcallback = DeviceEventCallback;
                TWAIN.ScanCallback scancallback = ScanCallbackTrigger;
                TWAIN.RunInUiThreadDelegate runinuithreaddelegate = RunInUiThread;
                
                // Instantiate TWAIN, and register ourselves
                m_twain = new TWAIN
                (
                    "TWAIN Working Group",
                    "TWAIN Open Source",
                    "TWAIN CS Scan App",
                    (ushort)TWAIN.TWON_PROTOCOL.MAJOR,
                    (ushort)TWAIN.TWON_PROTOCOL.MINOR,
                    ((uint)TWAIN.DG.APP2 | (uint)TWAIN.DG.CONTROL | (uint)TWAIN.DG.IMAGE),
                    TWAIN.TWCY.USA,
                    "TWAIN CS Scan App",
                    TWAIN.TWLG.ENGLISH_USA,
                    2,
                    4,
                    false,
                    false,
                    deviceeventcallback,
                    scancallback,
                    runinuithreaddelegate,
                    this.Handle
                );
            }
            catch (Exception exception)
            {
                TWAINWorkingGroup.Log.Error("exception - " + exception.Message);
                m_twain = null;
                m_blExit = true;
                MessageBox.Show
                (
                    "Unable to start, the most likely reason is that the TWAIN\n" +
                    "Data Source Manager is not installed on your system.\n\n" +
                    "An internet search for 'TWAIN DSM' will locate it and once\n" +
                    "installed, you should be able to proceed.\n\n" +
                    "You can also try the following link:\n" +
                    "http://sourceforge.net/projects/twain-dsm/",
                    "Error Starting TWAIN CS Scan"
                );
                return;
            }

            // Init our picture box
            InitImage();

            // Prep for TWAIN events
            SetMessageFilter(true);

            // Init our buttons
            SetButtons(EBUTTONSTATE.CLOSED);
        }

        #region TWAINCS Built-in Methods

        /// <summary>
        /// Our scan callback event, used to drive the engine when scanning.
        /// </summary>
        public delegate void ScanCallbackEvent();

        /// <summary>
        /// Our event handler for the scan callback event.  This will be
        /// called once by ScanCallbackTrigger on receipt of an event
        /// like MSG_XFERREADY, and then will be reissued on every call
        /// into ScanCallback until we're done and get back to state 4.
        ///  
        /// This helps to make sure we're always running in the context
        /// of FormMain on Windows, which is critical if we want drivers
        /// to work properly.  It also gives a way to break up the calls
        /// so the message pump is still reponsive.
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void ScanCallbackEventHandler(object sender, EventArgs e)
        {
            ScanCallback((m_twain == null) ? true : (m_twain.GetState() <= TWAIN.STATE.S3));
        }

        /// <summary>
        /// Rollback the TWAIN state to whatever is requested.
        /// </summary>
        /// <param name="a_state"></param>
        public void Rollback(TWAIN.STATE a_state)
        {
            TWAIN.TW_PENDINGXFERS twpendingxfers = default(TWAIN.TW_PENDINGXFERS);
            TWAIN.TW_USERINTERFACE twuserinterface = default(TWAIN.TW_USERINTERFACE);
            TWAIN.TW_IDENTITY twidentity = default(TWAIN.TW_IDENTITY);

            // Make sure we have something to work with
            if (m_twain == null)
            {
                return;
            }

            // Walk the states, we don't care about the status returns.  Basically,
            // these need to work, or we're guaranteed to hang

            // 7 --> 6
            if ((m_twain.GetState() == TWAIN.STATE.S7) && (a_state < TWAIN.STATE.S7))
            {
                m_twain.DatPendingxfers(TWAIN.DG.CONTROL, TWAIN.MSG.ENDXFER, ref twpendingxfers);
            }

            // 6 --> 5
            if ((m_twain.GetState() == TWAIN.STATE.S6) && (a_state < TWAIN.STATE.S6))
            {
                m_twain.DatPendingxfers(TWAIN.DG.CONTROL, TWAIN.MSG.RESET, ref twpendingxfers);
            }

            // 5 --> 4
            if ((m_twain.GetState() == TWAIN.STATE.S5) && (a_state < TWAIN.STATE.S5))
            {
                m_twain.DatUserinterface(TWAIN.DG.CONTROL, TWAIN.MSG.DISABLEDS, ref twuserinterface);
            }

            // 4 --> 3
            if ((m_twain.GetState() == TWAIN.STATE.S4) && (a_state < TWAIN.STATE.S4))
            {
                TWAIN.CsvToIdentity(ref twidentity, m_twain.GetDsIdentity());
                m_twain.DatIdentity(TWAIN.DG.CONTROL, TWAIN.MSG.CLOSEDS, ref twidentity);
            }

            // 3 --> 2
            if ((m_twain.GetState() == TWAIN.STATE.S3) && (a_state < TWAIN.STATE.S3))
            {
                m_twain.DatParent(TWAIN.DG.CONTROL, TWAIN.MSG.CLOSEDSM, ref m_intptrHwnd);
            }
        }

        /// <summary>
        /// Monitor for DG_CONTROL / DAT_NULL / MSG_* stuff (ex MSG_XFERREADY), this
        /// function is only triggered when SetMessageFilter() is called with 'true'.
        /// </summary>
        /// <param name="a_message">Message to process</param>
        /// <returns>Result of the processing</returns>
        [SecurityPermissionAttribute(SecurityAction.LinkDemand, Flags = SecurityPermissionFlag.UnmanagedCode)]
        public bool PreFilterMessage(ref Message a_message)
        {
            if (m_twain != null)
            {
                return (m_twain.PreFilterMessage(a_message.HWnd, a_message.Msg, a_message.WParam, a_message.LParam));
            }
            return (true);
        }

        /// <summary>
        /// Turn message filtering on or off, we use this to capture stuff
        /// like MSG_XFERREADY.  If it's off, then it's assumed we're getting
        /// this info through DAT_CALLBACK2.
        /// </summary>
        /// <param name="a_blAdd">True to turn it on</param>
        public void SetMessageFilter(bool a_blAdd)
        {
            if (a_blAdd)
            {
                Application.AddMessageFilter(this);
            }
            else
            {
                Application.RemoveMessageFilter(this);
            }
        }

        /// <summary>
        /// Restore a snapshot of driver values.
        /// </summary>
        /// <param name="a_szFile">File to use to restore driver settings</param>
        /// <returns>SUCCESS if the restore succeeded</returns>
        [PermissionSet(SecurityAction.LinkDemand, Name = "FullTrust", Unrestricted = false)]
        public TWAIN.STS RestoreSnapshot(string a_szFile)
        {
            TWAIN.STS sts;
            byte[] abSettings;
            UInt32 u32Length;
            IntPtr intptrHandle;
            string szCustomdsdata;
            string szStatus;
            CSV csv = new CSV();
            TWAIN.TW_CAPABILITY twcapability;
            TWAIN.TW_CUSTOMDSDATA twcustomdsdata;

            // Reset the driver, we don't care if it succeeds or fails
            szStatus = "";
            twcapability = default(TWAIN.TW_CAPABILITY);

            m_twain.CsvToCapability(ref twcapability, ref szStatus, "0,0,0");
            m_twain.DatCapability(TWAIN.DG.CONTROL, TWAIN.MSG.RESETALL, ref twcapability);

            // Get the snapshot from a file
            FileStream filestream = null;
            try
            {
                filestream = new FileStream(a_szFile, FileMode.Open);
                u32Length = (UInt32)filestream.Length;
                abSettings = new byte[u32Length];
                filestream.Read(abSettings, 0, abSettings.Length);
            }
            finally
            {
                if (filestream != null)
                {
                    filestream.Dispose();
                }
            }

            // Put it in an intptr
            intptrHandle = Marshal.AllocHGlobal((int)u32Length);
            Marshal.Copy(abSettings, 0, intptrHandle, (int)u32Length);

            // Set the snapshot, if possible
            csv.Add(u32Length.ToString());
            csv.Add(intptrHandle.ToString());
            szCustomdsdata = csv.Get();
            twcustomdsdata = default(TWAIN.TW_CUSTOMDSDATA);
            m_twain.CsvToCustomdsdata(ref twcustomdsdata, szCustomdsdata);
            sts = m_twain.DatCustomdsdata(TWAIN.DG.CONTROL, TWAIN.MSG.SET, ref twcustomdsdata);

            // Cleanup
            Marshal.FreeHGlobal(intptrHandle);

            // All done
            return (sts);
        }

        /// <summary>
        /// Save a snapshot of the driver values.
        /// </summary>
        /// <param name="a_szFile">File to receive driver settings</param>
        /// <returns>SUCCESS if the restore succeeded</returns>
        [PermissionSet(SecurityAction.LinkDemand, Name = "FullTrust", Unrestricted = false)]
        public TWAIN.STS SaveSnapshot(string a_szFile)
        {
            TWAIN.STS sts;
            TWAIN.TW_CUSTOMDSDATA twcustomdsdata;

            // Test
            if ((a_szFile == null) || (a_szFile == ""))
            {
                return (TWAIN.STS.SUCCESS);
            }

            // Get a snapshot, if possible
            twcustomdsdata = default(TWAIN.TW_CUSTOMDSDATA);
            sts = m_twain.DatCustomdsdata(TWAIN.DG.CONTROL, TWAIN.MSG.GET, ref twcustomdsdata);
            if (sts != TWAIN.STS.SUCCESS)
            {
                TWAINWorkingGroup.Log.Error("DAT_CUSTOMDSDATA failed...");
                return (sts);
            }

            // Save the data to a file
            FileStream filestream = null;
            try
            {
                IntPtr intptrInfo;
                filestream = new FileStream(a_szFile, FileMode.Create);
                byte[] abSettings = new byte[twcustomdsdata.InfoLength];
                intptrInfo = m_twain.DsmMemLock(twcustomdsdata.hData);
                Marshal.Copy(intptrInfo, abSettings, 0, (int)twcustomdsdata.InfoLength);
                m_twain.DsmMemUnlock(twcustomdsdata.hData);
                filestream.Write(abSettings, 0, abSettings.Length);
            }
            finally
            {
                if (filestream != null)
                {
                    filestream.Dispose();
                }
            }

            // Free the memory
            m_twain.DsmMemFree(ref twcustomdsdata.hData);

            // All done
            return (TWAIN.STS.SUCCESS);
        }

        /// <summary>
        /// Our callback for device events.  This is where we catch and
        /// report that a device event has been detected.  Obviously,
        /// we're not doing much with it.  A real application would
        /// probably take some kind of action.
        /// </summary>
        /// <returns>TWAIN status</returns>
        private TWAIN.STS DeviceEventCallback()
        {
            TWAIN.STS sts;
            TWAIN.TW_DEVICEEVENT twdeviceevent;

            // Drain the event queue
            while (true)
            {
                // Try to get an event
                twdeviceevent = default(TWAIN.TW_DEVICEEVENT);
                sts = m_twain.DatDeviceevent(TWAIN.DG.CONTROL, TWAIN.MSG.GET, ref twdeviceevent);
                if (sts != TWAIN.STS.SUCCESS)
                {
                    break;
                }
            }

            // Return a status, in case we ever need it for anything
            return (TWAIN.STS.SUCCESS);
        }

        /// <summary>
        /// Our scanning callback function.  We appeal directly to the supporting
        /// TWAIN object.  This way we don't have to maintain some kind of a loop
        /// inside of the application, which is the source of most problems that
        /// developers run into.
        /// 
        /// While it looks scary at first, there's really not a lot going on in
        /// here.  We do some sanity checks, we watch for certain kinds of events,
        /// we support the four methods of transferring images, and we dump out
        /// some meta-data about the transferred image.  However, because it does
        /// look scary I dropped in some region pragmas to break things up.
        /// </summary>
        /// <param name="a_blClosing">We're shutting down</param>
        /// <returns>TWAIN status</returns>
        private TWAIN.STS ScanCallbackTrigger(bool a_blClosing)
        {
            BeginInvoke(new MethodInvoker(delegate { ScanCallbackEventHandler(this, new EventArgs()); }));
            return (TWAIN.STS.SUCCESS);
        }
        private TWAIN.STS ScanCallback(bool a_blClosing)
        {
            TWAIN.STS sts;

            // Scoot
            if (m_twain == null)
            {
                return (TWAIN.STS.FAILURE);
            }

            // We're superfluous
            if (m_twain.GetState() <= TWAIN.STATE.S4)
            {
                return (TWAIN.STS.SUCCESS);
            }

            // We're leaving
            if (a_blClosing)
            {
                return (TWAIN.STS.SUCCESS);
            }

            // Do this in the right thread, we'll usually be in the
            // right spot, save maybe on the first call
            if (this.InvokeRequired)
            {
                return
                (
                    (TWAIN.STS)Invoke
                    (
                        (Func<TWAIN.STS>)delegate
                        {
                            return (ScanCallback(a_blClosing));
                        }
                    )
                );
            }

            // Handle DAT_NULL/MSG_XFERREADY
            if (m_twain.IsMsgXferReady() && !m_blXferReadySent)
            {
                m_blXferReadySent = true;

                // Get the amount of memory needed
                m_twsetupmemxfer = default(TWAIN.TW_SETUPMEMXFER);
                sts = m_twain.DatSetupmemxfer(TWAIN.DG.CONTROL, TWAIN.MSG.GET, ref m_twsetupmemxfer);
                if ((sts != TWAIN.STS.SUCCESS) || (m_twsetupmemxfer.Preferred == 0))
                {
                    m_blXferReadySent = false;
                    if (!m_blDisableDsSent)
                    {
                        m_blDisableDsSent = true;
                        Rollback(TWAIN.STATE.S4);
                    }
                }

                // Allocate the transfer memory (with a little extra to protect ourselves)
                m_intptrXfer = Marshal.AllocHGlobal((int)m_twsetupmemxfer.Preferred + 65536);
                if (m_intptrXfer == IntPtr.Zero)
                {
                    m_blDisableDsSent = true;
                    Rollback(TWAIN.STATE.S4);
                }
            }

            // Handle DAT_NULL/MSG_CLOSEDSREQ
            if (m_twain.IsMsgCloseDsReq() && !m_blDisableDsSent)
            {
                m_blDisableDsSent = true;
                Rollback(TWAIN.STATE.S4);
                SetButtons(EBUTTONSTATE.OPEN);
            }

            // Handle DAT_NULL/MSG_CLOSEDSOK
            if (m_twain.IsMsgCloseDsOk() && !m_blDisableDsSent)
            {
                m_blDisableDsSent = true;
                Rollback(TWAIN.STATE.S4);
                SetButtons(EBUTTONSTATE.OPEN);
            }

            // This is where the state machine transfers and optionally
            // saves the images to disk (it also displays them).  It'll go back
            // and forth between states 6 and 7 until an error occurs, or until
            // we run out of images
            if (m_blXferReadySent && !m_blDisableDsSent)
            {
                CaptureImages();
            }

            // Trigger the next event, this is where things all chain together.
            // We need begininvoke to prevent blockking, so that we don't get
            // backed up into a messy kind of recursion.  We need DoEvents,
            // because if things really start moving fast it's really hard for
            // application events, like button clicks to break through
            Application.DoEvents();
            BeginInvoke(new MethodInvoker(delegate { ScanCallbackEventHandler(this, new EventArgs()); }));

            // All done
            return (TWAIN.STS.SUCCESS);
        }

        /// <summary>
        /// Go through the sequence needed to capture images
        /// </summary>
        private void CaptureImages()
        {
            //Console.WriteLine("call me at:{0}",new DateTime().ToString());
            TWAIN.STS sts;
            TWAIN.TW_IMAGEINFO twimageinfo = default(TWAIN.TW_IMAGEINFO);
            TWAIN.TW_IMAGEMEMXFER twimagememxfer = default(TWAIN.TW_IMAGEMEMXFER);
            TWAIN.TW_PENDINGXFERS twpendingxfers = default(TWAIN.TW_PENDINGXFERS);
            TWAIN.TW_USERINTERFACE twuserinterface = default(TWAIN.TW_USERINTERFACE);

            // Dispatch on the state
            switch (m_twain.GetState())
            {
                // Not a good state, just scoot
                default:
                    return;

                // We're on our way out
                case TWAIN.STATE.S5:
                    m_blDisableDsSent = true;
                    m_twain.DatUserinterface(TWAIN.DG.CONTROL, TWAIN.MSG.DISABLEDS, ref twuserinterface);
                    SetButtons(EBUTTONSTATE.OPEN);
                    return;

                // Memory transfers
                case TWAIN.STATE.S6:
                case TWAIN.STATE.S7:
                    TWAIN.CsvToImagememxfer(ref twimagememxfer, "0,0,0,0,0,0,0," + ((int)TWAIN.TWMF.APPOWNS | (int)TWAIN.TWMF.POINTER) + "," + m_twsetupmemxfer.Preferred + "," + m_intptrXfer);
                    sts = m_twain.DatImagememxfer(TWAIN.DG.IMAGE, TWAIN.MSG.GET, ref twimagememxfer);
                    break;
            }

            // Handle problems
            if ((sts != TWAIN.STS.SUCCESS) && (sts != TWAIN.STS.XFERDONE))
            {
                m_blDisableDsSent = true;
                Rollback(TWAIN.STATE.S4);
                SetButtons(EBUTTONSTATE.OPEN);
                return;
            }

            // Allocate or grow the image memory
            if (m_intptrImage == IntPtr.Zero)
            {
                m_intptrImage = Marshal.AllocHGlobal((int)twimagememxfer.BytesWritten);
            }
            else
            {
                m_intptrImage = Marshal.ReAllocHGlobal(m_intptrImage, (IntPtr)(m_iImageBytes + twimagememxfer.BytesWritten));
            }

            // Ruh-roh...
            if (m_intptrImage == IntPtr.Zero)
            {
                m_blDisableDsSent = true;
                Rollback(TWAIN.STATE.S4);
                SetButtons(EBUTTONSTATE.OPEN);
                return;
            }

            // Copy into the buffer, and bump up our byte tally
            TWAIN.MemCpy(m_intptrImage + m_iImageBytes, m_intptrXfer, (int)twimagememxfer.BytesWritten);
            m_iImageBytes += (int)twimagememxfer.BytesWritten;

            // If we saw XFERDONE we can save the image, display it,
            // end the transfer, and see if we have more images
            if (sts == TWAIN.STS.XFERDONE)
            {
                // Bump up our image counter until the end of each scan session
                imageScanCount += 1;

                // Get the image info
                sts = m_twain.DatImageinfo(TWAIN.DG.IMAGE, TWAIN.MSG.GET, ref twimageinfo);

                // Add the appropriate header

                // Bitonal uncompressed
                if (((TWAIN.TWPT)twimageinfo.PixelType == TWAIN.TWPT.BW) && ((TWAIN.TWCP)twimageinfo.Compression == TWAIN.TWCP.NONE))
                {
                    TWAIN.TiffBitonalUncompressed tiffbitonaluncompressed;
                    tiffbitonaluncompressed = new TWAIN.TiffBitonalUncompressed((uint)twimageinfo.ImageWidth, (uint)twimageinfo.ImageLength, (uint)twimageinfo.XResolution.Whole, (uint)m_iImageBytes);
                    m_intptrImage = Marshal.ReAllocHGlobal(m_intptrImage, (IntPtr)(Marshal.SizeOf(tiffbitonaluncompressed) + m_iImageBytes));
                    TWAIN.MemMove((IntPtr)((UInt64)m_intptrImage + (UInt64)Marshal.SizeOf(tiffbitonaluncompressed)), m_intptrImage, m_iImageBytes);
                    Marshal.StructureToPtr(tiffbitonaluncompressed, m_intptrImage, true);
                    m_iImageBytes += (int)Marshal.SizeOf(tiffbitonaluncompressed);
                }

                // Bitonal GROUP4
                else if (((TWAIN.TWPT)twimageinfo.PixelType == TWAIN.TWPT.BW) && ((TWAIN.TWCP)twimageinfo.Compression == TWAIN.TWCP.GROUP4))
                {
                    TWAIN.TiffBitonalG4 tiffbitonalg4;
                    tiffbitonalg4 = new TWAIN.TiffBitonalG4((uint)twimageinfo.ImageWidth, (uint)twimageinfo.ImageLength, (uint)twimageinfo.XResolution.Whole, (uint)m_iImageBytes);
                    m_intptrImage = Marshal.ReAllocHGlobal(m_intptrImage, (IntPtr)(Marshal.SizeOf(tiffbitonalg4) + m_iImageBytes));
                    TWAIN.MemMove((IntPtr)((UInt64)m_intptrImage + (UInt64)Marshal.SizeOf(tiffbitonalg4)), m_intptrImage, m_iImageBytes);
                    Marshal.StructureToPtr(tiffbitonalg4, m_intptrImage, true);
                    m_iImageBytes += (int)Marshal.SizeOf(tiffbitonalg4);
                }

                // Gray uncompressed
                else if (((TWAIN.TWPT)twimageinfo.PixelType == TWAIN.TWPT.GRAY) && ((TWAIN.TWCP)twimageinfo.Compression == TWAIN.TWCP.NONE))
                {
                    TWAIN.TiffGrayscaleUncompressed tiffgrayscaleuncompressed;
                    tiffgrayscaleuncompressed = new TWAIN.TiffGrayscaleUncompressed((uint)twimageinfo.ImageWidth, (uint)twimageinfo.ImageLength, (uint)twimageinfo.XResolution.Whole, (uint)m_iImageBytes);
                    m_intptrImage = Marshal.ReAllocHGlobal(m_intptrImage, (IntPtr)(Marshal.SizeOf(tiffgrayscaleuncompressed) + m_iImageBytes));
                    TWAIN.MemMove((IntPtr)((UInt64)m_intptrImage + (UInt64)Marshal.SizeOf(tiffgrayscaleuncompressed)), m_intptrImage, m_iImageBytes);
                    Marshal.StructureToPtr(tiffgrayscaleuncompressed, m_intptrImage, true);
                    m_iImageBytes += (int)Marshal.SizeOf(tiffgrayscaleuncompressed);
                }

                // Gray JPEG
                else if (((TWAIN.TWPT)twimageinfo.PixelType == TWAIN.TWPT.GRAY) && ((TWAIN.TWCP)twimageinfo.Compression == TWAIN.TWCP.JPEG))
                {
                    // No work to be done, we'll output JPEG
                }

                // RGB uncompressed
                else if (((TWAIN.TWPT)twimageinfo.PixelType == TWAIN.TWPT.RGB) && ((TWAIN.TWCP)twimageinfo.Compression == TWAIN.TWCP.NONE))
                {
                    TWAIN.TiffColorUncompressed tiffcoloruncompressed;
                    tiffcoloruncompressed = new TWAIN.TiffColorUncompressed((uint)twimageinfo.ImageWidth, (uint)twimageinfo.ImageLength, (uint)twimageinfo.XResolution.Whole, (uint)m_iImageBytes);
                    m_intptrImage = Marshal.ReAllocHGlobal(m_intptrImage, (IntPtr)(Marshal.SizeOf(tiffcoloruncompressed) + m_iImageBytes));
                    //tiffcoloruncompressed.u64XResolution = 200;
                    TWAIN.MemMove((IntPtr)((UInt64)m_intptrImage + (UInt64)Marshal.SizeOf(tiffcoloruncompressed)), m_intptrImage, m_iImageBytes);
                    Marshal.StructureToPtr(tiffcoloruncompressed, m_intptrImage, true);
                    m_iImageBytes += (int)Marshal.SizeOf(tiffcoloruncompressed);
                }

                // RGB JPEG
                else if (((TWAIN.TWPT)twimageinfo.PixelType == TWAIN.TWPT.RGB) && ((TWAIN.TWCP)twimageinfo.Compression == TWAIN.TWCP.JPEG))
                {
                    // No work to be done, we'll output JPEG
                }

                // Oh well...
                else
                {
                    TWAINWorkingGroup.Log.Error("unsupported format <" + twimageinfo.PixelType + "," + twimageinfo.Compression + ">");
                    m_blDisableDsSent = true;
                    Rollback(TWAIN.STATE.S4);
                    SetButtons(EBUTTONSTATE.OPEN);
                    return;
                }

                // Handle the image being captured
                PostCapturingWorkflow();

                // End the transfer
                m_twain.DatPendingxfers(TWAIN.DG.CONTROL, TWAIN.MSG.ENDXFER, ref twpendingxfers);

                // Looks like we're done!
                if (twpendingxfers.Count == 0)
                {
                    Logging.Write(imageScanCount.SetQuantifier("successful scanned page") + ".");
                    Logging.Write(fileSaveCount.SetQuantifier("image file") + " created." );
                    Logging.Write(fileSkipCount.SetQuantifier("skipped page") + ".");

                    ShowStatus("Scan Finished", btnUpload.BackColor);

                    imageScanCount = 0;
                    fileSaveCount = 0;
                    fileSkipCount = 0;

                    m_blDisableDsSent = true;
                    m_twain.DatUserinterface(TWAIN.DG.CONTROL, TWAIN.MSG.DISABLEDS, ref twuserinterface);
                    SetButtons(EBUTTONSTATE.OPEN);
                    return;
                }
            }
            else
            {
                // Ending process also required for skipped page
                m_twain.DatPendingxfers(TWAIN.DG.CONTROL, TWAIN.MSG.ENDXFER, ref twpendingxfers);

                if (twpendingxfers.Count == 0)
                {
                    m_blDisableDsSent = true;
                    m_twain.DatUserinterface(TWAIN.DG.CONTROL, TWAIN.MSG.DISABLEDS, ref twuserinterface);
                    SetButtons(EBUTTONSTATE.OPEN);
                    return;
                }
            }
        }

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        [SuppressMessage("Microsoft.Security", "CA2123:OverrideLinkDemandsShouldBeIdenticalToBase")]
        [SecurityPermissionAttribute(SecurityAction.LinkDemand, Flags = SecurityPermissionFlag.UnmanagedCode)]
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                if (m_twain != null)
                {
                    m_twain.Dispose();
                    m_twain = null;
                }
                if (m_bitmapGraphic1 != null)
                {
                    m_bitmapGraphic1.Dispose();
                    m_bitmapGraphic1 = null;
                }
                if (m_bitmapGraphic2 != null)
                {
                    m_bitmapGraphic2.Dispose();
                    m_bitmapGraphic2 = null;
                }
                if (m_brushBackground != null)
                {
                    m_brushBackground.Dispose();
                    m_brushBackground = null;
                }
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        /// <summary>
        /// Something horrible has happened and we need to abort.
        /// </summary>
        /// <returns></returns>
        public bool ExitRequested()
        {
            return (m_blExit);
        }

        #endregion

        #endregion


        ///////////////////////////////////////////////////////////////////////////////
        // Private Methods, this includes our callback "ReportImage"
        ///////////////////////////////////////////////////////////////////////////////
        #region Private Methods

        #region TWAINCS Built-in Methods

        /// <summary>
        /// TWAIN needs help, if we want it to run stuff in our main UI thread.
        /// </summary>
        /// <param name="code">the code to run</param>
        private void RunInUiThread(Action a_action)
        {
            RunInUiThread(this, a_action);
        }

        /// <summary>
        /// TWAIN needs help, if we want it to run stuff in our main UI thread.
        /// </summary>
        /// <param name="control">the control to run in</param>
        /// <param name="code">the code to run</param>
        static public void RunInUiThread(Object a_object, Action a_action)
        {
            Control control = (Control)a_object;
            if (control.InvokeRequired)
            {
                control.Invoke(new FormScan.RunInUiThreadDelegate(RunInUiThread), new object[] { a_object, a_action });
                return;
            }
            a_action();
        }

        /// <summary>
        /// Initialize the picture boxes and the graphics to support them, we're
        /// doing this to maximize performance during scanner.
        /// </summary>
        private void InitImage()
        {
            // Make sure our picture boxes don't do much work
            pbScannedImg.SizeMode = PictureBoxSizeMode.Normal;

            m_bitmapGraphic1 = new Bitmap(pbScannedImg.Width, pbScannedImg.Height, PixelFormat.Format32bppPArgb);
            m_graphics1 = Graphics.FromImage(m_bitmapGraphic1);
            m_graphics1.CompositingMode = CompositingMode.SourceCopy;
            m_graphics1.CompositingQuality = CompositingQuality.HighSpeed;
            m_graphics1.InterpolationMode = InterpolationMode.Low;
            m_graphics1.PixelOffsetMode = PixelOffsetMode.HighSpeed;
            m_graphics1.SmoothingMode = SmoothingMode.HighSpeed;

            m_bitmapGraphic2 = new Bitmap(pbScannedImg.Width, pbScannedImg.Height, PixelFormat.Format32bppPArgb);
            m_graphics2 = Graphics.FromImage(m_bitmapGraphic2);
            m_graphics2.CompositingMode = CompositingMode.SourceCopy;
            m_graphics2.CompositingQuality = CompositingQuality.HighSpeed;
            m_graphics2.InterpolationMode = InterpolationMode.Low;
            m_graphics2.PixelOffsetMode = PixelOffsetMode.HighSpeed;
            m_graphics2.SmoothingMode = SmoothingMode.HighSpeed;

            m_brushBackground = new SolidBrush(Color.White);
            m_rectangleBackground = new Rectangle(0, 0, m_bitmapGraphic1.Width, m_bitmapGraphic1.Height);
        }

        /// <summary>
        /// Clear our event list, and reset our event.
        /// </summary>
        public void ClearEvents()
        {
            m_blXferReadySent = false;
            m_blDisableDsSent = false;
        }

        /// <summary>
        /// Debugging output that we can monitor, this is just a place
        /// holder for this particular application.
        /// </summary>
        /// <param name="a_szOutput"></param>
        private void WriteOutput(string a_szOutput)
        {
            return;
        }

        /// <summary>
        /// Close the currently opened TWAIN driver.
        /// </summary>
        private void CloseScanner()
        {
            this.Text = this.Owner.Text;
            Rollback(TWAIN.STATE.S3);
            SetButtons(EBUTTONSTATE.CLOSED);
        }

        #endregion

        #region General Interface

        private bool HasLoaded = false;
        private bool IsResizing = false;

        private Rectangle initialBounds;

        private void FormScan_Load(object sender, EventArgs e)
        {
#if DEBUG
            if (Program.AppSettings.EnableTWAIN)
            {
                this.GetAllTWAINDrivers();
            }
#else
            this.GetAllTWAINDrivers();
#endif

            this.cbPageConfig.SelectedIndex = 0;

            this.HasLoaded = true;
        }

        /// <summary>
        /// Display all TWAIN drivers available in a list box for selection.
        /// </summary>
        private void GetAllTWAINDrivers()
        {
            string szDefault;
            List<(string Name, string Csv)> ltszIdentity = new List<(string, string)>();
            TWAIN.STS sts;
            TWAIN.TW_IDENTITY twidentity = default(TWAIN.TW_IDENTITY);

            // Open the DSM (Data Source Manager)
            m_intptrHwnd = this.Handle;
            sts = m_twain.DatParent(TWAIN.DG.CONTROL, TWAIN.MSG.OPENDSM, ref m_intptrHwnd);
            if (sts != TWAIN.STS.SUCCESS)
            {
                AlertBox.Show("OPENDSM failed...");
                return;
            }

            // Enumerate the drivers
            for (sts = m_twain.DatIdentity(TWAIN.DG.CONTROL, TWAIN.MSG.GETFIRST, ref twidentity);
                 sts != TWAIN.STS.ENDOFLIST;
                 sts = m_twain.DatIdentity(TWAIN.DG.CONTROL, TWAIN.MSG.GETNEXT, ref twidentity))
            {
                string szIdentity = TWAIN.IdentityToCsv(twidentity);
                string[] aszIdentity = CSV.Parse(szIdentity);
                ltszIdentity.Add((aszIdentity[11], szIdentity));
            }

            // In case no driver has been installed
            if (ltszIdentity.Count == 0)
            {
                AlertBox.Show("There are no TWAIN drivers installed on this system.");
                return;
            }

            // Get the default driver
            sts = m_twain.DatIdentity(TWAIN.DG.CONTROL, TWAIN.MSG.GETDEFAULT, ref twidentity);
            if (sts == TWAIN.STS.SUCCESS)
            {
                szDefault = TWAIN.IdentityToCsv(twidentity);
            }
            else
            {
                szDefault = ltszIdentity[0].Csv;
            }

            // Suspend drawing of control
            lbScanners.BeginUpdate();

            // Populate our driver list
            foreach (var sz in ltszIdentity)
            {
                lbScanners.Items.Add(sz.Name);
            }
            lbScanners.Tag = ltszIdentity.ToDictionary(sz => sz.Name, sz => sz.Csv);

            // Select the default
            lbScanners.SelectedIndex = lbScanners.FindStringExact(ltszIdentity.Where(sz => sz.Csv == szDefault).First().Name);

            // Resume drawing control
            lbScanners.EndUpdate();
        }

        private void lbScanners_SelectedIndexChanged(object sender, EventArgs e)
        {
            // This event can be raised unintendedly when the form gets resized
            if (this.HasLoaded & this.IsResizing)
            {
                return;
            }

            // Rollback the status first of all
            CloseScanner();

            // Retrieve the selected scanner information
            string selected = (string)lbScanners.SelectedItem;
            string szSelected = (lbScanners.Tag as Dictionary<string, string>)[selected];

            // Make it the default, we don't care if this succeeds
            TWAIN.TW_IDENTITY twidentity = default(TWAIN.TW_IDENTITY);
            TWAIN.CsvToIdentity(ref twidentity, szSelected);
            m_twain.DatIdentity(TWAIN.DG.CONTROL, TWAIN.MSG.SET, ref twidentity);

            // Open it
            TWAIN.STS sts = m_twain.DatIdentity(TWAIN.DG.CONTROL, TWAIN.MSG.OPENDS, ref twidentity);
            if (sts != TWAIN.STS.SUCCESS)
            {
                AlertBox.Show("Unable to open scanner (is it turned on and plugged in?)");
                m_blExit = true;
                return;
            }

            // Update the main form title
            this.Text = String.Format("{0} ({1})", this.Owner.Text, twidentity.ProductName.Get());

            // Strip off unsafe chars.  Sadly, mono let's us down here
            m_szProductDirectory = CSV.Parse(szSelected)[11];
            foreach (char c in new char[41]
                            { '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
                              '\x08', '\x09', '\x0A', '\x0B', '\x0C', '\x0D', '\x0E', '\x0F', '\x10', '\x11', '\x12',
                              '\x13', '\x14', '\x15', '\x16', '\x17', '\x18', '\x19', '\x1A', '\x1B', '\x1C', '\x1D',
                              '\x1E', '\x1F', '\x22', '\x3C', '\x3E', '\x7C', ':', '*', '?', '\\', '/'
                            }
                    )
            {
                m_szProductDirectory = m_szProductDirectory.Replace(c, '_');
            }

            // We're doing memory transfers
            string szStatus = "";
            TWAIN.TW_CAPABILITY twcapability = default(TWAIN.TW_CAPABILITY);
            m_twain.CsvToCapability(ref twcapability, ref szStatus, "ICAP_XFERMECH,TWON_ONEVALUE,TWTY_UINT16,TWSX_MEMORY");
            sts = m_twain.DatCapability(TWAIN.DG.CONTROL, TWAIN.MSG.SET, ref twcapability);
            if (sts != TWAIN.STS.SUCCESS)
            {
                m_blExit = true;
                return;
            }

            // Decide whether or not to show the driver's window messages
            szStatus = "";
            twcapability = default(TWAIN.TW_CAPABILITY);
            m_twain.CsvToCapability(ref twcapability, ref szStatus, "CAP_INDICATORS,TWON_ONEVALUE,TWTY_BOOL," + (m_blIndicators ? "TRUE" : "FALSE"));
            sts = m_twain.DatCapability(TWAIN.DG.CONTROL, TWAIN.MSG.SET, ref twcapability);
            if (sts != TWAIN.STS.SUCCESS)
            {
                m_blExit = true;
                return;
            }

            // Duplex option (single side / double side)
            szStatus = "";
            twcapability = default(TWAIN.TW_CAPABILITY);
            m_twain.CsvToCapability(ref twcapability, ref szStatus, String.Format("CAP_DUPLEXENABLED,TWON_ONEVALUE,TWTY_BOOL,{0}", cbPageConfig.SelectedIndex == 0 ? "TRUE" : "FALSE"));
            sts = m_twain.DatCapability(TWAIN.DG.CONTROL, TWAIN.MSG.SET, ref twcapability);
            if (sts != TWAIN.STS.SUCCESS)
            {
                m_blExit = true;
                return;
            }

            // New state
            SetButtons(EBUTTONSTATE.OPEN);
        }

        private void ShowStatus(string status, Color foreColor)
        {
            labelStatus.Text = status;
            labelStatus.ForeColor = foreColor;
            labelStatus.Update();
        }

        private void FormScan_Shown(object sender, EventArgs e)
        {
            FormMain main = (FormMain)this.Owner;
            main.SetMouseMoveEvent(this);
            main.SetMouseMoveEvent(this.Controls.Cast<Control>().ToArray());

            initialBounds = this.Bounds;
            this.WindowState = FormWindowState.Maximized;
        }

        private void FormScan_Resize(object sender, EventArgs e)
        {
            this.IsResizing = true;

            if (this.Bounds != initialBounds)
            {
                var xScale = (float)this.Bounds.Width / initialBounds.Width;
                var yScale = (float)this.Bounds.Height / initialBounds.Height;

                //foreach (Control ctrl in panel2.Controls)
                //{
                //    ctrl.Font = new Font(ctrl.Font.FontFamily, ctrl.Font.Size * xScale, ctrl.Font.Style);
                //}

                foreach (Control ctrl in panel1.Controls)
                {
                    ctrl.Font = new Font(ctrl.Font.FontFamily, ctrl.Font.Size * yScale, ctrl.Font.Style);
                }
                
                foreach (Control ctrl in this.Controls.Cast<Control>())
                {
                    ctrl.Scale(new SizeF(xScale, yScale));
                    ctrl.Font = new Font(ctrl.Font.FontFamily, ctrl.Font.Size * yScale, ctrl.Font.Style);
                }

                initialBounds = this.Bounds;
            }

            InitImage();

            if (pbScannedImg.Image != null)
            {
                string imageFromPath = getImageFileName(tvDocs.SelectedNode);
                if (string.IsNullOrEmpty(imageFromPath))
                {
                    imageFromPath = getFileFullPath(tvDocs.SelectedNode.Name); 
                }
                try
                {
                    using (Image img = Image.FromFile(imageFromPath))
                    {
                        LoadImage((Bitmap)img, pbScannedImg.Enabled);
                    }
                }
                catch
                {
                    UnloadImage();
                }
            }

            this.IsResizing = false;
        }

        /// <summary>
        /// Configure our buttons to match our current state.
        /// </summary>
        /// <param name="a_ebuttonstate"></param>
        private void SetButtons(EBUTTONSTATE a_ebuttonstate)
        {
            // To prevent trigger of click event by a disabled button after being re-enabled
            Application.DoEvents();

            switch (a_ebuttonstate)
            {
                default:
                case EBUTTONSTATE.CLOSED:
                    btnScan.Enabled = false;
                    btnStop.Enabled = false;
                    btnDelPage.Enabled = true;
                    btnImport.Enabled = true;
                    btnUpload.Enabled = true;
                    break;

                case EBUTTONSTATE.OPEN:
                    btnScan.Enabled = true;
                    btnStop.Enabled = false;
                    btnDelPage.Enabled = true;
                    btnImport.Enabled = true;
                    btnUpload.Enabled = true;
                    break;

                case EBUTTONSTATE.SCANNING:
                    btnScan.Enabled = false;
                    btnStop.Enabled = true;
                    btnDelPage.Enabled = false;
                    btnImport.Enabled = false;
                    btnUpload.Enabled = false;
                    break;

                case EBUTTONSTATE.UPLOADING:
                    btnScan.Enabled = false;
                    btnStop.Enabled = false;
                    btnDelPage.Enabled = false;
                    btnImport.Enabled = false;
                    btnUpload.Enabled = false;
                    break;
            }
        }

        private void btnDelPage_EnabledChanged(object sender, EventArgs e)
        {
            SetButtonColor(btnDelPage, Color.Gold, Color.PaleGoldenrod);
        }

        private void btnImport_EnabledChanged(object sender, EventArgs e)
        {
            SetButtonColor(btnImport, Color.SkyBlue, Color.LightBlue);
        }

        private void btnUpload_EnabledChanged(object sender, EventArgs e)
        {
            SetButtonColor(btnUpload, Color.LimeGreen, Color.DarkSeaGreen);
        }

        private void SetButtonColor(Button btn, Color enabled, Color disabled)
        {
            btn.BackColor = btn.Enabled ? enabled : disabled;
            btn.ForeColor = btn.Enabled ? SystemColors.ControlText : Color.DarkGray;
        }

        /// <summary>
        /// We're being closed, clean up nicely.
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void FormScan_FormClosing(object sender, FormClosingEventArgs e)
        {
            // This is essential or the Capturing Center will not be able to work properly again when it is reopened
            Rollback(TWAIN.STATE.S2);

            // Make sure this thing is off
            SetMessageFilter(false);

            // Get rid of the TWAIN object
            if (m_twain != null)
            {
                m_twain.Dispose();
                m_twain = null;
            }
            
            // This will prevent ReportImage from doing anything as we close
            m_graphics1 = null;

            // Bye-bye logging
            TWAINWorkingGroup.Log.Close();

            // Clear the temp folder
            if (Directory.Exists(fileOutDir))
            { 
                foreach (FileInfo file in new DirectoryInfo(fileOutDir).GetFiles())
                {
                    FileUtil.Delete(file);
                }

                if (Directory.Exists(cropOutDir))
                {
                    try
                    {
                        Directory.Delete(cropOutDir, true);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(string.Format("Error on deleting cropped folder: {0}", ex.Message));
                    }
                }
            }
        }

        #endregion

        #region Scan Interface

        private List<string> CurrentScannedBatch;

        private void cbPageConfig_SelectedIndexChanged(object sender, EventArgs e)
        {
            string szStatus;
            TWAIN.STS sts;
            TWAIN.TW_CAPABILITY twcapability;

            szStatus = "";
            twcapability = default(TWAIN.TW_CAPABILITY);
            m_twain.CsvToCapability(ref twcapability, ref szStatus, String.Format("CAP_DUPLEXENABLED,TWON_ONEVALUE,TWTY_BOOL,{0}", cbPageConfig.SelectedIndex == 0 ? "TRUE" : "FALSE"));
            sts = m_twain.DatCapability(TWAIN.DG.CONTROL, TWAIN.MSG.SET, ref twcapability);
            if (sts != TWAIN.STS.SUCCESS)
            {
                m_blExit = true;
                return;
            }
        }

        private void btnConfig_Click(object sender, EventArgs e)
        {
            this.ClearEvents();
            TWAIN.TW_USERINTERFACE twuserinterface = default(TWAIN.TW_USERINTERFACE);
            m_twain.CsvToUserinterface(ref twuserinterface, "TRUE,FALSE," + Handle);
            m_twain.DatUserinterface(TWAIN.DG.CONTROL, TWAIN.MSG.ENABLEDSUIONLY, ref twuserinterface);
        }

        /// <summary>
        /// Start a scan session.
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void btnScan_Click(object sender, EventArgs e)
        {
            string szTwmemref = "FALSE,FALSE," + this.Handle;
            TWAIN.STS sts;
            tvDocs.SelectedNode = null;

            // Send the command
            ClearEvents();
            TWAIN.TW_USERINTERFACE twuserinterface = default(TWAIN.TW_USERINTERFACE);
            m_twain.CsvToUserinterface(ref twuserinterface, szTwmemref);
            sts = m_twain.DatUserinterface(TWAIN.DG.CONTROL, TWAIN.MSG.ENABLEDS, ref twuserinterface);
            if (sts == TWAIN.STS.SUCCESS)
            {
                CurrentScannedBatch = new List<string>();
                ShowStatus("Scanning...", btnImport.BackColor);
                SetButtons(EBUTTONSTATE.SCANNING);
                Logging.Write(String.Format("Start {0} Scanning.", cbPageConfig.Text));
            }
        }

        /// <summary>
        /// Custom workflow to handle each captured image.
        /// </summary>
        private void PostCapturingWorkflow()
        {
            // Create the directory, if needed
            if (!Directory.Exists(fileOutDir))
            {
                Directory.CreateDirectory(fileOutDir);
            }

            try
            {
                // Turn the image into a byte array
                byte[] abImage = new byte[m_iImageBytes];
                Marshal.Copy(m_intptrImage, abImage, 0, m_iImageBytes);

                // Turn the byte array into a stream
                MemoryStream memorystream = new MemoryStream(abImage);
                Bitmap bitmap = (Bitmap)Image.FromStream(memorystream);
                LoadImage(bitmap, false);

                // Crop the image into the size of fitting a valid QR code
                Bitmap cropped = new Bitmap(500, 500);
                using (Graphics g = Graphics.FromImage(cropped))
                {
                    int qrSize = Program.AppSettings.QRDecodeSize;
                    g.DrawImage(bitmap, new Rectangle(0, 0, 500, 500), new Rectangle(0, 0, qrSize, qrSize), GraphicsUnit.Point);
                    bitmap.Dispose();
                }

                // Decode the QR code, if any
                IBarcodeReader reader = new BarcodeReader();
                reader.Options = new DecodingOptions
                {
                    PossibleFormats = new List<BarcodeFormat> { BarcodeFormat.QR_CODE }
                };
                Result result = reader.Decode(cropped);
                result = result ?? reader.Decode(cropped);
                result = result ?? reader.Decode(cropped);

                try
                {
                    // Append the Document Tree
                    string imageFileName = AddToDocTree(result);
                    FinishingDocTree();

                    //// Create the directory, if needed
                    //if (!Directory.Exists(cropOutDir))
                    //{
                    //    Directory.CreateDirectory(cropOutDir);
                    //}
                    //cropped.Save(getCropFullPath(imageFileName));

                    // Write it out
                    if (imageFileName != null)
                    {
                        string imageOutFile = getFileFullPath(imageFileName);
                        TWAIN.WriteImageFile(imageOutFile, m_intptrImage, m_iImageBytes, out imageOutFile);
                        fileSaveCount++;
                        Logging.Write("Scanned image file " + imageFileName + " created successfully.");
                    }
                    else
                    {
                        fileSkipCount++;
                    }
                }
                catch (Exception ex)
                {
                    fileSkipCount++;
                    Logging.Write(ex, "Exception occurred has caused a scanned image file skipped.");
                }

                // Free the original memory
                Marshal.FreeHGlobal(m_intptrImage);
                m_intptrImage = IntPtr.Zero;
                m_iImageBytes = 0;

                // Cleanup
                bitmap.Dispose();
                memorystream = null; // disposed by the bitmap
                abImage = null;
            }
            catch (Exception ex)
            {
                btnStop.PerformClick();

                Program.HandleGenericException(ex, "Error occurred on capturing workflow.");
                ShowStatus("Scan Failed", Color.Red);
            }
        }

        /// <summary>
        /// Request that scanning stop (gracefully).
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void btnStop_Click(object sender, EventArgs e)
        {
            TWAIN.TW_PENDINGXFERS twpendingxfers = default(TWAIN.TW_PENDINGXFERS);
            m_twain.DatPendingxfers(TWAIN.DG.CONTROL, TWAIN.MSG.STOPFEEDER, ref twpendingxfers);
        }

        #endregion

        #region Import

        /// <summary>
        /// Import button click to browse file(s) for manual import (without scanning).
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void btnImport_Click(object sender, EventArgs e)
        {
            Dictionary<string, string> fileFormats = new Dictionary<string, string>();
            fileFormats.Add("tif", "Image");
            fileFormats.Add("tiff", "Image");
            fileFormats.Add("jpg", "Image");
            fileFormats.Add("jpeg", "Image");
            fileFormats.Add("pdf", "PDF Document");
            fileFormats.Add("doc", "Microsoft Word");
            fileFormats.Add("docx", "Microsoft Word");
            fileFormats.Add("xls", "Microsoft Excel");
            fileFormats.Add("xlsx", "Microsoft Excel");
            fileFormats.Add("ppt", "Microsoft PowerPoint");
            fileFormats.Add("pptx", "Microsoft PowerPoint");

            string filterStr = String.Format("All Files|*.{0}", String.Join(";*.", fileFormats.Keys));
            foreach (string value in fileFormats.Values.Distinct())
            {
                var exts = fileFormats.Where(format => format.Value == value).Select(format => format.Key);
                filterStr += String.Format("|{0} ({1})|*.{2}", value, String.Join(",", exts), String.Join(";*.", exts));
            }

            OpenFileDialog dialogImport = new OpenFileDialog
            {
                Title = "Browse Files for Import",
                Filter = filterStr,
                Multiselect = true
            };

            if (dialogImport.ShowDialog() == DialogResult.OK)
            {
                string[] fileNames = dialogImport.FileNames;

                // Reject if any filename has the same pattern as scanned files
                foreach (string file in fileNames)
                {
                    if (Regex.IsMatch(Path.GetFileName(file), "^img/d{6}.tif$"))
                    {
                        AlertBox.Show(String.Format("The filename pattern of file {0} is reserved (imgxxxxxx.tif). Please rename it and then try again."));
                        return;
                    }
                }

                tvDocs.SelectedNode = null;
                ShowStatus("Importing...", btnImport.BackColor);

                fileSaveCount = fileNames.Length;
                fileSkipCount = 0;
                foreach (string file in fileNames)
                {
                    ImportFile(file);
                }

                Logging.Write(String.Format("{0}.", fileSaveCount.SetQuantifier("successful import")));
                Logging.Write(String.Format("{0} failed.", fileSkipCount.SetQuantifier("import")));

                if (fileSkipCount == 0)
                {
                    ShowStatus("Import All Succeeded", btnUpload.BackColor);
                }
                else
                {
                    ShowStatus(String.Format("{0} Failed", fileSkipCount.SetQuantifier("import")), Color.Red);
                }

                FinishingDocTree();
                UnloadImage();
            }
        }
        private void ImportFile(string srcFile)
        {
            string srcFileName = Path.GetFileName(srcFile);
            string outFileName;

            // Create the directory, if needed
            if (!Directory.Exists(fileOutDir))
            {
                Directory.CreateDirectory(fileOutDir);
            }

            // Write it out
            try
            {
                if (FileUtil.IsImage(srcFile))
                {
                    try
                    {
                        using (Bitmap bitmap = (Bitmap)Image.FromFile(srcFile))
                        {
                            // Crop the image into the size of fitting a valid QR code
                            Bitmap cropped = new Bitmap(500, 500);
                            using (Graphics g = Graphics.FromImage(cropped))
                            {
                                int qrSize = Program.AppSettings.QRDecodeSize;
                                g.DrawImage(bitmap, new Rectangle(0, 0, 500, 500), new Rectangle(0, 0, qrSize, qrSize), GraphicsUnit.Point);
                                bitmap.Dispose();
                            }

                            //// Create the directory, if needed
                            //if (!Directory.Exists(cropOutDir))
                            //{
                            //    Directory.CreateDirectory(cropOutDir);
                            //}
                            //cropped.Save(getCropFullPath(fileName));

                            // Decode the QR code, if any
                            IBarcodeReader reader = new BarcodeReader();
                            Result result = reader.Decode(cropped);

                            // Append the Document Tree
                            outFileName = AddToDocTree(result, srcFileName);
                        }
                    }
                    catch (OutOfMemoryException)
                    {
                        Logging.Write(String.Format("Unable to load image {0} due to out of memory. Please check if the file is corrupted.", Path.GetFileName(srcFile)));
                        throw;
                    }
                }
                else if (Path.GetExtension(srcFile).ToLowerInvariant() == ".pdf")
                {
                    // Convert PDF to TIF image(s) before decoding any QR code 
                    IronPdf.PdfDocument doc = IronPdf.PdfDocument.FromFile(srcFile);
                    string imageOutPath = getFileFullPath(srcFileName.Replace(".pdf", " P*.tif"));
                    string[] imageOutFiles = doc.RasterizeToImageFiles(imageOutPath, IronPdf.Imaging.ImageType.Tiff);

                    using (Bitmap bitmap = (Bitmap)Image.FromFile(imageOutFiles[0]))
                    {
                        // Crop the image into the size of fitting a valid QR code
                        Bitmap cropped = new Bitmap(500, 500);
                        using (Graphics g = Graphics.FromImage(cropped))
                        {
                            int qrSize = Program.AppSettings.QRDecodeSize; // + 50 Reserve some margins
                            g.DrawImage(bitmap, new Rectangle(0, 0, 500, 500), new Rectangle(0, 0, qrSize, qrSize), GraphicsUnit.Point);
                            bitmap.Dispose();
                        }

                        //// Create the directory, if needed
                        //if (!Directory.Exists(cropOutDir))
                        //{
                        //    Directory.CreateDirectory(cropOutDir);
                        //}
                        //cropped.Save(getCropFullPath(imageFileName));

                        // Decode the QR code, if any
                        IBarcodeReader reader = new BarcodeReader();
                        Result result = reader.Decode(cropped);

                        // Append the Document Tree
                        //outFileName = ManageDocTree(result, srcFileName).Replace(".tif", ".pdf");

                        // Rename all TIF images which are converted from PDF
                        foreach (string oldPath in imageOutFiles)
                        {
                            // Append the Document Tree
                            outFileName = AddToDocTree(result, Path.GetFileName(oldPath), Path.GetFileName(srcFile));

                            string newPath = getFileFullPath(outFileName);
                            System.IO.File.Move(oldPath, newPath);
                        }

                        outFileName = srcFileName;
                    }
                }
                else
                {
                    // Go straight to append the DocTree as meta-documents are supposed to be in either image or PDF format
                    outFileName = AddToDocTree(null, srcFileName);
                }

                // Copy the original input file to temp folder
                System.IO.File.Copy(srcFile, getFileFullPath(outFileName), true);

                Logging.Write(String.Format("File {0} imported successfully.", srcFileName));
            }
            catch (Exception)
            {
                fileSaveCount--;
                fileSkipCount++;
            }
        }

        #endregion

        #region Document Tree

        #region Input

        private string AddToDocTree(Result result, string srcFileName = null, string pdfFileName = null)
        {
            if (result == null)
            {
                // Page without valid QR code
                 return AddToDocTree_CaseDoc(srcFileName,pdfFileName);
            }
            else
            {
                try
                {
                    // Extract text value from QR code result, if any
                    string value = Encoding.UTF8.GetString(Convert.FromBase64String(result.Text));

                    try
                    {
                        // Loop the Base64 decoding until the configured number of iterations has been reached
                        for (int i = 0; i < Program.AppSettings.Base64Loop; i++)
                        {
                            string decoded = Encoding.UTF8.GetString(Convert.FromBase64String(value));
                            if (Regex.IsMatch(decoded, "[\\w\\s]+"))
                            {
                                throw new System.FormatException();
                            }
                        }

                        return AddToDocTree_CaseQrGeneric(value, srcFileName is null,pdfFileName);
                    }
                    catch (System.FormatException)
                    {
                        return AddToDocTree_CaseQrGeneric(value, srcFileName is null,pdfFileName);
                    }
                }
                catch (System.FormatException)
                {
                    // Unable to decode by Base64 even once means the QR code is invalid
                    return AddToDocTree_CaseDoc(srcFileName, pdfFileName);
                }
            }
        }

        private string AddToDocTree_CaseQrGeneric(string value, bool isScanned, string pdfFileName = null)
        {
             MetaDocument metaDoc;
            TreeNode parent;
            TreeNodeCollection children;

            // Determine the tree location to add or get branch node
            if (tvDocs.SelectedNode is null)
            {
                // First input
                parent = null;
                children = tvDocs.Nodes;
            }
            else if (tvDocs.SelectedNode.Tag is Document)
            {
                // Stop further leveling after a document being inserted
                parent = null;
                children = tvDocs.Nodes;
            }
            else
            {
                // Go to the next node level
                parent = tvDocs.SelectedNode;
                children = parent.Nodes;
            }

            // Validate the value and modify it if needed
            foreach (char badChar in Path.GetInvalidFileNameChars().Append(char.Parse(tvDocs.PathSeparator)))
            {
                value = value.Replace(badChar.ToString(), "");
            }
            if (children.Cast<TreeNode>().Any(node => node.Text == value))
            {
                // Join the node with the same display text
                TreeNode mergedNode = parent?.GetNode(value) ?? tvDocs.GetNode(value);

                MetaDocumentList metaDocList = (MetaDocumentList)mergedNode.Tag;
                metaDoc=new MetaDocument(metaDocList);
                metaDocList.Add(metaDoc);
                tvDocs.SelectedNode = mergedNode;
            }
            else
            {
                // Create new node if there is no existing node with such value
                TreeNode newNode = children.Add(value);
                metaDoc = new MetaDocument(newNode, isScanned);
              //  newNode.Tag= metaDoc;   
                newNode.Tag = new MetaDocumentList() { metaDoc };
                tvDocs.SelectedNode = newNode;
            }

            return metaDoc.FileName;
        }

        private string AddToDocTree_CaseDoc(string srcFileName = null, string pdfFileName=null)
        {
            Document doc;
            TreeNodeCollection children;
            
            // Determine the tree location to add document node
            if (tvDocs.SelectedNode is null)
            {
                // If no node is selected (first input)
                children = tvDocs.Nodes;
            }
            else if (tvDocs.SelectedNode.Tag is Document)
            {
                // Stay at the same level as the previous page
                children = tvDocs.SelectedNode.Parent?.Nodes ?? tvDocs.Nodes;
            }
            else
            {
                // Go to the next node level
                children = tvDocs.SelectedNode.Nodes;
            }

            if (srcFileName is null)
            {
                // Standardised display names and filenames for scanned documents
                var existingDocs = children.Cast<TreeNode>().Select(node => (Document)node.Tag);
                var scannedFiles = existingDocs.Where(tag => tag.IsScanned).Select(tag => tag.FileName);
                int seqNo = scannedFiles.ToList().GetNextSeqNumber();
                string displayName = String.Format("img{0:D6}", seqNo);

                TreeNode newNode = children.Add(displayName);
                doc = new Document(newNode, true);

                // For PDF imports
                if (pdfFileName != null)
                {
                    doc.PdfFileName = pdfFileName;
                }

                tvDocs.SelectedNode = newNode;
            }
            else
            {
                // Make sure same files are not added again
                List<TreeNode> nodeList = GetFullNodeList();
                if (nodeList.Any(node => node.Text == srcFileName))
                {
                    Logging.Write(String.Format("Duplicated Import: The file {0} has already been imported into the system.", srcFileName));
                    throw new Exception();
                }

                // Directly extract the original filename as display text for imported documents
                TreeNode newNode = children.Add(srcFileName);
                doc = new Document(newNode,false);

                // For PDF imports
                if (pdfFileName != null)
                {
                    doc.PdfFileName = pdfFileName;
                }

                tvDocs.SelectedNode = newNode;
            }
            
            return doc.FileName;
        }

        private void AddToDocTree_CasePdfDoc(string[] pageFileNames)
        {

        }

        private void FinishingDocTree()
        {
            tvDocs.Sort();
            tvDocs.ExpandAll();
        }

        #endregion

        #region Select & Delete

        private string getImageFileName(TreeNode node)
        {
            if (node.Tag is Document)
            {
                Document doc = (Document)node.Tag;

                if (FileUtil.IsImage(doc.FileName))
                {
                   return getFileFullPath(doc.FileName);
                }
                else if (doc.IsPdf)
                {
                   return getFileFullPath(Path.GetFileNameWithoutExtension(doc.FileName)) + ".tif";
                }
            }
            return string.Empty;
        }

        private void tvDocs_AfterSelect(object sender, TreeViewEventArgs e)
        {
            if (labelStatus.Text == "Scanning..." | labelStatus.Text == "Importing...")
            {
                return;
            }

           string imageFromPath=getImageFileName(e.Node);

            if (!string.IsNullOrEmpty(imageFromPath))
            {
                using (Bitmap bitmap = (Bitmap)Image.FromFile(imageFromPath))
                {
                    LoadImage(bitmap, true);
                }
            }
            else
            {
                UnloadImage();
            }
        }

        private void btnDelPage_Click(object sender, EventArgs e)
        {
            TreeNode selected = this.tvDocs.SelectedNode;

            try
            {
                string branchName="";
                if (selected is null)
                {
                    // If nothing selected
                    return;
                }
                else if (selected.Tag is Document)
                {
                    if (selected.Parent?.Parent != null)
                    {
                        branchName = selected.Parent.FullPath;
                    }
                    string message = String.Format("Are you sure to delete document {0} from branch {1}?", selected.Text, branchName);
                    if (ConfirmBox.Show(message) is DialogResult.Yes)
                    {
                        DeleteDocument(selected);
                    }
                }
                else
                {
                    if (selected?.Parent != null)
                    {
                        branchName = selected.FullPath;
                    }
                    string message = String.Format("Are you sure to delete all documents from branch {0}?", branchName);
                    if (ConfirmBox.Show(message) is DialogResult.Yes)
                    {
                        DeleteBranch(selected);
                    }
                }
            }
            catch (Exception ex)
            {
                Program.HandleGenericException(ex, "Error occurred on deleting pages.");
            }
        }

        private void DeleteDocument(TreeNode node)
        {
            Document doc = (Document)node.Tag;

            // Delete the corresponding temp file(s)
            FileUtil.Delete(getFileFullPath(doc.FileName));
            //FileUtil.Delete(getCropFullPath(fileName));
            if (doc.IsPdf)
            {
                FileUtil.Delete(getFileFullPath(doc.FileName.Replace(".tif", ".pdf")));
            }

            // Remove the node
            TreeNode parent = node.Parent;
            (parent?.Nodes ?? tvDocs.Nodes).Remove(node);
            if (node?.Parent != null)
            {
                Logging.Write(String.Format("Document {0} has been deleted.", node.FullPath));
            }
            else
            {
                Logging.Write(String.Format("Document {0} has been deleted.", getFileFullPath(doc.FileName)));
            }

            // Delete the parent as well if it is the only child
            if (parent?.Nodes.Count == 0)
            {
                DeleteBranch(parent);
            }
        }

        private void DeleteBranch(TreeNode node)
        {
            // Loop for the children if the selected branch node is not yet empty
            if (node.Nodes.Count > 0)
            {
                foreach (TreeNode child in node.Nodes)
                {
                    if (child.Tag is Document)
                    {
                        DeleteDocument(child);
                    }
                    else
                    {
                        DeleteBranch(child);
                    }
                }
                if (node.Parent!=null)
                {
                    Logging.Write(String.Format("All documents from branch {0} has been deleted.", node?.FullPath??""));
                }
            }

            // One branch node to a list of meta-documents
            foreach (MetaDocument metaDoc in (List<MetaDocument>)node.Tag)
            {
                // Delete the corresponding temp file(s)
                FileUtil.Delete(getFileFullPath(metaDoc.FileName));
                //FileUtil.Delete(getCropFullPath(fileName));
                if (metaDoc.IsPdf)
                {
                    FileUtil.Delete(getFileFullPath(metaDoc.FileName.Replace(".tif", ".pdf")));
                }
            }

            // Remove the emptied branch node
            TreeNode parent = node.Parent;
            (parent?.Nodes ?? tvDocs.Nodes).Remove(node);
            if (parent!=null)
            {
                Logging.Write(String.Format("Empty branch {0} has been deleted.", node?.FullPath ?? ""));
            }

            // Delete the parent as well if it is the only child
            if (parent?.Nodes.Count == 0)
            {
                DeleteBranch(parent);
            }
        }

        //private void ConfirmToDelete(TreeNode selectedNode, string description)
        //{
        //    if (ConfirmBox.Show(String.Format("Are you sure to delete {0}?", description)) is DialogResult.Yes)
        //    {
        //        try
        //        {
        //            if (selectedNode.Tag is Document)
        //            {
        //                DeleteDocFile(selectedNode);
        //            }
        //            else
        //            {
        //                DeleteMetaDocFiles(selectedNode);
        //            }

        //            DeleteNode(selectedNode, description);
        //            //TreeNode parent = selectedNode.Parent;
        //            //if (parent is null)
        //            //{
        //            //    tvDocs.Nodes.Remove(selectedNode);
        //            //    Logging.Write(String.Format("{0}{1} has been deleted.", char.ToUpper(description[0]), description.Substring(1)));
        //            //}
        //            //else
        //            //{
        //            //    parent.Nodes.Remove(selectedNode);
        //            //    Logging.Write(String.Format("{0}{1} has been deleted.", char.ToUpper(description[0]), description.Substring(1)));
        //            //    PostDeleteClearing(parent);
        //            //}

        //            //UnloadImage();
        //        }
        //        catch (Exception ex)
        //        {
        //            Program.HandleGenericException(ex, "Error occurred on deleting pages.");
        //        }
        //    }
        //}

        //private void DeleteNode(TreeNode node, Action log)
        //{
        //    TreeNode parent = node.Parent;
        //    if (parent is null)
        //    {
        //        tvDocs.Nodes.Remove(node);
        //        Logging.Write(String.Format("{0}{1} has been deleted.", char.ToUpper(description[0]), description.Substring(1)));
        //    }
        //    else
        //    {
        //        parent.Nodes.Remove(node);
        //        Logging.Write(String.Format("{0}{1} has been deleted.", char.ToUpper(description[0]), description.Substring(1)));

        //        if (parent.Nodes.Count == 0)
        //        {
        //            DeleteBranch(parent);
        //            DeleteNode(parent, String.Format("Empty branch {0}", parent.FullPath));
        //        }
        //    }
        //}

        //private void PostDeleteClearing(TreeNode parentNode)
        //{
        //    // If the only child has just been deleted
        //    if (parentNode?.Nodes.Count == 0)
        //    {
        //        DeleteBranch(parentNode);

        //        TreeNode grandparent = parentNode.Parent;
        //        if (grandparent is null)
        //        {
        //            tvDocs.Nodes.Remove(parentNode);
        //            Logging.Write(String.Format("Empty branch {0} has been deleted.", parentNode.FullPath));
        //        }
        //        else
        //        {
        //            grandparent.Nodes.Remove(parentNode);
        //            Logging.Write(String.Format("Empty branch {0} has been deleted.", parentNode.FullPath));
        //            PostDeleteClearing(grandparent);
        //        }
        //    }
        //}

        #endregion

        #region Edit

        #region Common

        private void ReDefineBranch(TreeNode srcNode, TreeNode destParent)
        {
            // Append new node if the destination does not exist
            TreeNode destNode = destParent.GetNode(srcNode.Text) ?? destParent.Nodes.Add(srcNode.Text);

            foreach (MetaDocument metaDoc in (List<MetaDocument>)srcNode.Tag)
            {
                // Create new meta-document object
                MetaDocument newMetaDoc = new MetaDocument(destNode, metaDoc.IsScanned);

                // Move (rename) the file
                string srcFile = getFileFullPath(metaDoc.FileName);
                string destFile = getFileFullPath(newMetaDoc.FileName);
                System.IO.File.Move(srcFile, destFile);
                //File.Move(getCropFullPath(metaDoc.FileName), getCropFullPath(newMetaDoc.FileName));
                if (newMetaDoc.IsPdf)
                {
                    System.IO.File.Move(srcFile.Replace(".tif", ".pdf"), destFile.Replace(".tif", ".pdf"));
                }
            }

            // Handle the children
            foreach (TreeNode child in srcNode.Nodes)
            {
                if (child.Tag is Document)
                {
                    ReDefineDoc(child, destNode);
                }
                else
                {
                    ReDefineBranch(child, destNode.GetNode(child.Text) ?? destNode.Nodes.Add(child.Text));
                }
            }
        }

        private void ReDefineDoc(TreeNode srcNode, TreeNode destParent)
        {
            // Append new node for destination
            TreeNode destNode = destParent.Nodes.Add(srcNode.Text);

            // Create new document object
            Document doc = (Document)srcNode.Tag;
            Document newDoc = new Document(destNode, doc.IsScanned);

            // Move (rename) the file
            string srcFile = getFileFullPath(doc.FileName);
            string destFile = getFileFullPath(newDoc.FileName);
            System.IO.File.Move(srcFile, destFile);
            //File.Move(getCropFullPath(doc.FileName), getCropFullPath(newDoc.FileName));
            if (newDoc.IsPdf)
            {
                System.IO.File.Move(srcFile.Replace(".tif", ".pdf"), destFile.Replace(".tif", ".pdf"));
            }
        }

        #endregion

        #region By Pop-up Form

        private void tvDocs_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Clicks > 1)
            {
                tvDocs.BeforeCollapse += tvDocs_CancelCollapse;
            }
        }

        private void tvDocs_CancelCollapse(object sender, TreeViewCancelEventArgs e)
        {
            e.Cancel = true;
            tvDocs.BeforeCollapse -= tvDocs_CancelCollapse;
        }

        private void tvDocs_NodeMouseDoubleClick(object sender, TreeNodeMouseClickEventArgs e)
        {
            //if (e.Node.Level > 0)
            //{
            //    FormEdit formEdit = new FormEdit(e.Node)
            //    {
            //        Parent = this,
            //        Icon = this.Main.Icon,
            //        Text = "Edit Page Assignment",
            //        //CmsUtil = this.CmsUtil
            //    };
            //    formEdit.ShowDialog();
            //}
        }

        internal void FormEdit_Submit(string empID, string docCat, TreeNode targetNode)
        {
            //TreeNode empNode, docCatNode;

            //// Append new node if empID does not exist as top level node
            //if ((empNode = tvDocs.GetNode(empID)) == null)
            //{
            //    empNode = tvDocs.AppendNode(empID);
            //}

            //// Append new node if docCat does not exist as empID's child
            //if ((docCatNode = empNode.GetNode(docCat)) == null)
            //{
            //    docCatNode = empNode.AppendNode(docCat);
            //}

            //// Determine whether the target is a document category node
            //if (targetNode.Text == docCat)
            //{
            //    ReDefineBranch(targetNode, docCatNode);
            //}
            //else
            //{
            //    ReDefineDoc(targetNode, empID, docCat);
            //}


            //TreeNode targetParent = targetNode.Parent;
            //tvDocs.Nodes.Remove(targetNode);

            //// Delete the parent if the target node is the only child
            //if (draggedParent.Nodes.Count == 0)
            //{
            //    DeleteBranch(draggedParent);
            //}

            //FinishingDocTree();
        }

        #endregion

        #region By Drag & Drop

        private void tvDocs_ItemDrag(object sender, ItemDragEventArgs e)
        {
            // Move the dragged node when the left mouse button is used
            if (e.Button == MouseButtons.Left)
            {
                DoDragDrop(e.Item, DragDropEffects.Move);
            }
        }

        private void tvDocs_DragOver(object sender, DragEventArgs e)
        {
            // Setup the basic effects
            e.Effect = e.AllowedEffect;

            // Retrieve the client coordinates of the mouse position
            Point targetPoint = tvDocs.PointToClient(new Point(e.X, e.Y));

            // Select the node at the mouse position.  
            tvDocs.SelectedNode = tvDocs.GetNodeAt(targetPoint);
        }

        private void tvDocs_DragDrop(object sender, DragEventArgs e)
        {
            // Retrieve the dragged node
            TreeNode draggedNode = (TreeNode)e.Data.GetData(typeof(TreeNode));

            if (draggedNode.Level == 0)
            {                
                return; // Moving the root node does not make sense
            }

            // Retrieve the node at the drop location
            TreeNode droppedParent = tvDocs.SelectedNode;

            if (droppedParent.Tag is Document)
            {
                return; // Document nodes are not allowed to be dropped at
            }
            if (droppedParent == draggedNode.Parent)
            {
                return; // When the node is dropped at its original parent
            }

            // Determine whether the target is a document node
            if (draggedNode.Tag is Document)
            {
                ReDefineDoc(draggedNode, droppedParent);
            }
            else
            {
                ReDefineBranch(draggedNode, droppedParent);
            }

            // Remove the node from its original location
            TreeNode draggedParent = draggedNode.Parent;
            draggedParent.Nodes.Remove(draggedNode);

            // Delete the parent if the dragged node is the only child
            if (draggedParent.Nodes.Count == 0)
            {
                DeleteBranch(draggedParent);
            }

            FinishingDocTree();
        }

        #endregion

        #endregion

        #region Util

        public List<TreeNode> GetFullNodeList()
        {
            // Create a list of top level document nodes
            List<TreeNode> list = tvDocs.Nodes.Cast<TreeNode>().Where(node => node.Tag is Document).ToList();

            for (int i = 0; tvDocs.Nodes.Find("B" + i, true).Count() > 0; i++)
            {
                foreach (TreeNode node in tvDocs.Nodes.Find("B" + i, true))
                {
                    // Add the branch nodes
                    list.Add(node);

                    foreach (TreeNode child in node.Nodes)
                    {
                        // Add the document nodes which are under any branch node
                        if (child.Tag is Document)
                        {
                            list.Add(child);
                        }
                    }
                }
            }

            return list;
        }

        #endregion

        #endregion

        #region Image Preview

        private double _zoomLevel = 1;
        private List<Image> _imageZoomList = new List<Image>();
        private bool _inZoomInMode = false;
        private bool _inZoomOutMode = false;

        /// <summary>
        /// Load an image into a picture box, maintain its aspect ratio.
        /// </summary>
        /// <param name="a_picturebox"></param>
        /// <param name="a_graphics"></param>
        /// <param name="a_bitmapGraphic"></param>
        /// <param name="a_bitmap"></param>
        private void LoadImage(Bitmap a_bitmap, bool enableBtns)
        {
            // Reset the controls
            pbScannedImg.Enabled = false;
            if (enableBtns) pbScannedImg.Enabled = true;

            // Maintain the aspect ratio
            int iWidth = (int)(a_bitmap.Width * GetAspectRatio(a_bitmap));
            int iHeight = (int)(a_bitmap.Height * GetAspectRatio(a_bitmap));

            // Display the image
            m_graphics1.FillRectangle(m_brushBackground, m_rectangleBackground);
            m_graphics1.DrawImage(a_bitmap, new Rectangle(((int)m_bitmapGraphic1.Width - iWidth) / 2, ((int)m_bitmapGraphic1.Height - iHeight) / 2, iWidth, iHeight));
            pbScannedImg.Image = m_bitmapGraphic1;
            pbScannedImg.Update();

            // Restore the state of image zooming
            _zoomLevel = 1;
            _inZoomInMode = false;
            _inZoomOutMode = false;
            _imageZoomList.Clear();
        }

        private double GetAspectRatio(Image a_bitmap)
        {
            double fRatioWidth = (double)m_bitmapGraphic1.Size.Width / (double)a_bitmap.Width;
            double fRatioHeight = (double)m_bitmapGraphic1.Size.Height / (double)a_bitmap.Height;
            return Math.Min(fRatioWidth, fRatioHeight);
        }

        private void UnloadImage()
        {
            pbScannedImg.Image = null;
            pbScannedImg.Update();
            pbScannedImg.Enabled = false;
        }

        private void pbScannedImg_EnabledChanged(object sender, EventArgs e)
        {
            if (pbScannedImg.Enabled)
            {
                btnRotate.Enabled = true;
                btnZoomIn.Enabled = true;
                btnZoomOut.Enabled = false;
            }
            else
            {
                if (_inZoomInMode) btnZoomIn.PerformClick();
                if (_inZoomOutMode) btnZoomOut.PerformClick();
                btnRotate.Enabled = false;
                btnZoomIn.Enabled = false;
                btnZoomOut.Enabled = false;
            }
        }

        private void btnRotate_Click(object sender, EventArgs e)
        {
            if (tvDocs.SelectedNode.Name == "B" + tvDocs.SelectedNode.Level)
            {
                return;
            }
            string filename=getImageFileName(tvDocs.SelectedNode);

            using (Image img = Image.FromFile(getFileFullPath(filename)))
            {
                if (img != null)
                {
                    img.RotateFlip(RotateFlipType.Rotate90FlipNone);
                    img.Save(getFileFullPath(filename));

                    // Maintain the aspect ratio
                    int iWidth = (int)(img.Width * GetAspectRatio(img));
                    int iHeight = (int)(img.Height * GetAspectRatio(img));

                    // Display the image
                    Graphics bmGraphics = Graphics.FromImage(m_bitmapGraphic1);
                    m_graphics1.FillRectangle(m_brushBackground, m_rectangleBackground);
                    m_graphics1.DrawImage(img, new Rectangle(((int)m_bitmapGraphic1.Width - iWidth) / 2, ((int)m_bitmapGraphic1.Height - iHeight) / 2, iWidth, iHeight));
                    pbScannedImg.Image = m_bitmapGraphic1;
                    pbScannedImg.Update();
                }
            }                      
        }

        /// <summary>
        /// Enter zoom in mode.
        /// </summary>
        private void btnZoomIn_Click(object sender, EventArgs e)
        {
            if (_inZoomOutMode)
            {
                btnZoomOut.PerformClick();
            }
            
            if (!_inZoomInMode)
            {
                _inZoomInMode = true;
                pbScannedImg.Cursor = Cursors.Cross;
                pbScannedImg.MouseUp += new MouseEventHandler(pbScannedImg_ZoomIn);
                btnZoomIn.BackColor = Color.Gold;
            }
            else
            {
                _inZoomInMode = false;
                pbScannedImg.Cursor = Cursors.Default;
                pbScannedImg.MouseUp -= new MouseEventHandler(pbScannedImg_ZoomIn);
                btnZoomIn.BackColor = btnRotate.BackColor;
            }
        }

        /// <summary>
        /// Enter zoom out mode.
        /// </summary>
        private void btnZoomOut_Click(object sender, EventArgs e)
        {
            if (_inZoomInMode)
            {
                btnZoomIn.PerformClick();
            }

            if (!_inZoomOutMode)
            {
                _inZoomOutMode = true;
                pbScannedImg.Cursor = Cursors.Cross;
                pbScannedImg.MouseUp += new MouseEventHandler(pbScannedImg_ZoomOut);
                btnZoomOut.BackColor = Color.Gold;
            }
            else
            {
                _inZoomOutMode = false;
                pbScannedImg.Cursor = Cursors.Default;
                pbScannedImg.MouseUp -= new MouseEventHandler(pbScannedImg_ZoomOut);
                btnZoomOut.BackColor = btnRotate.BackColor;
            }
        }

        /// <summary>
        /// Update the image to show the portion of the original image with zooming 25% further for 4 times at most.
        /// </summary>
        private void pbScannedImg_ZoomIn(object sender, MouseEventArgs e)
        {
            btnRotate.Enabled = false;
            btnZoomOut.Enabled = true;

            _zoomLevel += 0.25;
            double zoomFactor = _zoomLevel / (_zoomLevel - 0.25);

            string imgFromPath = getImageFileName(tvDocs.SelectedNode);
            if (string.IsNullOrEmpty(imgFromPath))
            {
                imgFromPath = getFileFullPath(tvDocs.SelectedNode.Name);
            }
            using (Image original = Image.FromFile(imgFromPath))
            {
                // Maintain the aspect ratio
                int iWidth = (int)(original.Width * GetAspectRatio(original));
                int iHeight = (int)(original.Height * GetAspectRatio(original));

                // Calculate the width and height of the portion of the image we want to show in the PictureBox
                double zoomWidth = iWidth / zoomFactor;
                double zoomHeight = iHeight / zoomFactor;

                // Calculate the horizontal and vertical midpoints for the crosshair cursor and correct centering of the new image
                double halfWidth = zoomWidth / 2;
                double halfHeight = zoomHeight / 2;

                // Create an instance of zoomed image
                Image zoomedBitmap = new Bitmap(pbScannedImg.Width, pbScannedImg.Height, PixelFormat.Format32bppPArgb);

                // Create a temporary Graphics object to work on the bitmap
                Graphics bmGraphics = Graphics.FromImage(zoomedBitmap);

                // Set the interpolation mode
                bmGraphics.InterpolationMode = InterpolationMode.HighQualityBicubic;

                // Draw the portion of the main image onto the bitmap
                // The target rectangle is already known now.
                // Here the mouse position of the cursor on the main image is used to
                // cut out a portion of the main image.
                bmGraphics.FillRectangle(m_brushBackground, m_rectangleBackground);
                bmGraphics.DrawImage(_imageZoomList.Count == 0 ? m_bitmapGraphic1 : _imageZoomList.Last(),
                                     new Rectangle(((int)zoomedBitmap.Width - iWidth) / 2, ((int)zoomedBitmap.Height - iHeight) / 2, iWidth, iHeight),
                                     new Rectangle((int)(e.X - halfWidth), (int)(e.Y - halfHeight), (int)zoomWidth, (int)zoomHeight),
                                     GraphicsUnit.Pixel);

                // Load the bitmap on the PictureBox
                pbScannedImg.Image = zoomedBitmap;

                // Dispose of the Graphics object
                bmGraphics.Dispose();

                // Update the PictureBox to reflect the changes
                pbScannedImg.Update();

                // Temporarily store the image instance
                _imageZoomList.Add(zoomedBitmap);
            }

            if (_zoomLevel == 2)
            {
                btnZoomIn.PerformClick();
                btnZoomIn.Enabled = false;
            }
        }

        /// <summary>
        /// Undo the zoom in action(s) one by one until the zoom factor being 1 (i.e.the original image).
        /// </summary>
        private void pbScannedImg_ZoomOut(object sender, MouseEventArgs e)
        {
            btnZoomIn.Enabled = true;

            _zoomLevel -= 0.25;
            _imageZoomList.Remove(_imageZoomList.Last());


            string imgFromPath = getImageFileName(tvDocs.SelectedNode);
            if (string.IsNullOrEmpty(imgFromPath))
            {
                imgFromPath = getFileFullPath(tvDocs.SelectedNode.Name);
            }

            if (_zoomLevel == 1)
            {
                using (Image original = Image.FromFile(imgFromPath))
                {
                    btnZoomOut.PerformClick();
                    LoadImage((Bitmap)original, true);
                }
            }
            else
            {
                pbScannedImg.Image = _imageZoomList.Last();
            }
        }

        #endregion

        #region Upload
        private Dictionary<string, object> CreateUploadMetaData(string tableName)
        {


            var metadata = new Dictionary<string, object>();

            if (tableName != null && "HKJC A01" == tableName) {
                metadata.Add("bet_acc_no", "Not captured");
                metadata.Add("hkid", "Not captured");
                //metadata.Add("acc_create_date", todayDateStr);
            } else if (tableName != null && "GF200 Single Page" == tableName)
            {
                metadata.Add("state_post", "Not captured");
                metadata.Add("name_chi", "Not captured");
                metadata.Add("hkid", "Not captured");
            }
            else
            {
                // to add more metadata
            }
            metadata.Add("ocr_stts", "Pending");
            metadata.Add("idx_stts", "Pending");
            metadata.Add("cls_stts", "Pending");
            return metadata;
        }
        /// <summary>
        /// Start Upload by button click.
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void btnUpload_Click(object sender, EventArgs e)
        {
            int uploadSuccessCount = 0;
            int uploadFailureCount = 0;

            string prompt = "Are you sure to upload the documents?";
            if (ConfirmBox.Show(prompt) is DialogResult.No)
            {
                return;
            }

            EBUTTONSTATE lastState = this.btnScan.Enabled ? EBUTTONSTATE.OPEN : EBUTTONSTATE.CLOSED;
            SetButtons(EBUTTONSTATE.UPLOADING);
            ShowStatus("Uploading...", btnImport.BackColor);
            Logging.Write("Start uploading documents to server.");

            var allDocNodes = GetFullNodeList().Where(node => node.Tag is Document);
            var allDocs = allDocNodes.Select(node => (Document)node.Tag);

            foreach (TreeNode parentNode in allDocs.Select(doc => doc.AssociatedNode.Parent).Distinct())
            {
                var childrenDocs = allDocs.Where(doc => doc.AssociatedNode.Parent == parentNode);

                // Get the collection of scanned and imported document objects respectively for each parent (outermost branch)
                Document[] scanDocs = childrenDocs.Where(doc => doc.IsScanned).ToArray();
                Document[] importDocs = childrenDocs.Except(scanDocs).ToArray();
                string selectedType = "GF200 Single Page";

                if (scanDocs.Any())
                {
                    try
                    {
                        // Merge scanned documents for each parent into one file
                        //string mergedTif = MergeTiff(docs);
                        string mergedPdf = MergeTiffToPdf(scanDocs);
                        Logging.Write(String.Format("Merged {0} scanned pages into file {1}.", scanDocs.Count(), mergedPdf));


                        //string selectedType = "HKJC A01";
                        var metadata=CreateUploadMetaData(selectedType);
                        DateTime nowTime = DateTime.Now;
                        string todayDateStr = nowTime.ToString("yyyy-MM-dd");
                        string todayDateStrNoHypen = nowTime.ToString("yyyyMMdd");
                        string todayTimeStr = nowTime.ToString("HHmmssffff");
                        //int todayDateIntNoHypen = Int64.Parse(todayDateStrNoHypen);
                        //int todayTimeInt = Int32.Parse(todayTimeStr);
                        //int todayIntTotal = todayDateIntNoHypen + todayTimeInt;
                                                metadata.Add("document_name", mergedPdf);
                                                metadata.Add("upload_by", _cms.CurrentUsername ?? "system");
                        metadata.Add("upload_date", todayDateStrNoHypen + " " + todayTimeStr);
                                                _cms.UploadDocument(getFileFullPath(mergedPdf), metadata, selectedType);

                        uploadSuccessCount++;
                        Logging.Write(String.Format("Successully uploaded file {0}.", mergedPdf));
                        //Logging.Write("Object ID: " + newObjId);

                        try
                        {
                            foreach (Document doc in scanDocs)
                            {
                                DeleteDocument(doc.AssociatedNode);
                            }
                        }
                        catch (Exception ex)
                        {
                            Logging.Write(ex, "Error occurred during cleanup after successful upload.");
                        }
                    }
                    catch (Exception ex)
                    {
                        uploadFailureCount++;
                        if (parentNode?.Parent!=null)
                        {
                            Logging.Write(ex, String.Format("Failed to upload scanned document from {0}.", parentNode?.FullPath is null ? "top level" : "branch " + parentNode.FullPath));
                        }
                    }
                }

                var pdfImports = importDocs.Where(doc => doc.PdfFileName != null);
                var imgImportKeyList = importDocs.Except(pdfImports).Select(doc => doc);
                var pdfImportKeyList = pdfImports.Select(doc => doc.PdfFileName).Distinct();

                List<Document> importDict = new List<Document>();
                importDict.AddRange(imgImportKeyList);

                if (pdfImportKeyList!=null)
                {
                    foreach (string key in pdfImportKeyList)
                    {
                        importDict.Add(pdfImports.First(doc => doc.PdfFileName == key));
                    }
                }
              
                // Then handle imported documents one by one
                foreach (Document doc in importDict)
                {
                    // Always upload a PDF to DMS.
                    try
                    {
                        var metadata = CreateUploadMetaData(selectedType);
                        DateTime nowTime = DateTime.Now;
                        string todayDateStr = nowTime.ToString("yyyy-MM-dd");
                        string todayDateStrNoHypen = nowTime.ToString("yyyyMMdd");
                        string todayTimeStr = nowTime.ToString("HH:mm:ss");
                        //int todayDateIntNoHypen = Int64.Parse(todayDateStrNoHypen);
                        //int todayTimeInt = Int32.Parse(todayTimeStr);
                        //int todayIntTotal = todayDateIntNoHypen + todayTimeInt;
                        string uploadPdfPath = ResolvePdfPathForUpload(doc);
                        string uploadPdfName = Path.GetFileName(uploadPdfPath);
                        metadata.Add("document_name", uploadPdfName);
                        metadata.Add("upload_by", _cms.CurrentUsername ?? "system");
                        metadata.Add("upload_date", todayDateStr + " " + todayTimeStr);
                        _cms.UploadDocument(uploadPdfPath, metadata, selectedType);
                        

                        uploadSuccessCount++;
                        Logging.Write(String.Format("Successfully uploaded document {0}.", doc.Key));
                        //Logging.Write("Object ID: " + newObjId);

                        try
                        {
                            if (!string.IsNullOrEmpty(doc.PdfFileName))
                            {
                                foreach (Document pdfDoc in importDocs.Where(z=>z.PdfFileName==doc.PdfFileName))
                                {
                                    DeleteDocument(pdfDoc.AssociatedNode);
                                }
                            }
                            else
                            {
                                DeleteDocument(doc.AssociatedNode);
                            }
                        }
                        catch (Exception ex)
                        {
                            Logging.Write(ex, "Error occurred during cleanup after successful upload.");
                        }
                    }
                    catch (Exception ex)
                    {
                        uploadFailureCount++;
                        Logging.Write(ex, String.Format("Failed to upload document {0}.", doc.Key));
                    }
                }
            }

            Logging.Write(String.Format("{0}.", uploadSuccessCount.SetQuantifier("successful upload")));
            Logging.Write(String.Format("{0} failed.", uploadFailureCount.SetQuantifier("upload")));

            if (uploadFailureCount > 0)
            {
                ShowStatus(String.Format("{0} Failed", uploadFailureCount.SetQuantifier("Upload")), Color.Red);
            }
            else if (uploadSuccessCount > 0)
            {
                ShowStatus("Upload All Succeeded", btnUpload.BackColor);
            }

            UnloadImage();
            SetButtons(lastState);
        }

        private string MergeTiff(Document[] srcDocs)
        {
            string mergedFile = getFileFullPath(String.Format("CVT_{0}.tif", srcDocs[0].AssociatedNode.Parent.FullPath));

            //get the codec for tiff files
            ImageCodecInfo info = null;
            foreach (ImageCodecInfo ice in ImageCodecInfo.GetImageEncoders())
                if (ice.MimeType == "image/tiff")
                    info = ice;

            //use the save encoder
            System.Drawing.Imaging.Encoder enc = System.Drawing.Imaging.Encoder.SaveFlag;

            EncoderParameters ep = new EncoderParameters(1);
            ep.Param[0] = new EncoderParameter(enc, (long)EncoderValue.MultiFrame);

            Bitmap pages = null;

            for (int frame = 0; frame < srcDocs.Count(); frame++)
            {
                string filename = srcDocs[frame].FileName;

                if (frame == 0)
                {
                    using (MemoryStream ms = new MemoryStream(System.IO.File.ReadAllBytes(getFileFullPath(filename))))
                    {
                        pages = (Bitmap)Image.FromStream(ms);

                        //save the first frame
                        pages.Save(mergedFile, info, ep);
                    }
                }
                else
                {
                    //save the intermediate frames
                    ep.Param[0] = new EncoderParameter(enc, (long)EncoderValue.FrameDimensionPage);

                    try
                    {
                        using (MemoryStream mss = new MemoryStream(System.IO.File.ReadAllBytes(getFileFullPath(filename))))
                        {
                            Bitmap bm = (Bitmap)Image.FromStream(mss);
                            pages.SaveAdd(bm, ep);
                        }
                    }
                    catch (Exception)
                    {
                        //LogError(e, s);
                    }
                }

                if (frame == srcDocs.Count() - 1)
                {
                    //flush and close
                    ep.Param[0] = new EncoderParameter(enc, (long)EncoderValue.Flush);
                    pages.SaveAdd(ep);
                }
            }

            return mergedFile;
        }

        private string ResolvePdfPathForUpload(Document doc)
        {
            if (doc == null)
            {
                throw new ArgumentNullException(nameof(doc));
            }

            string preferredName = !string.IsNullOrWhiteSpace(doc.PdfFileName)
                ? doc.PdfFileName
                : doc.FileName;

            string sourcePath = getFileFullPath(preferredName);
            if (Path.GetExtension(sourcePath).Equals(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                return sourcePath;
            }

            return PdfConverter.Convert(sourcePath);
        }

        private string MergeTiffToPdf(Document[] srcDocs)
        {
            string outFileName;
            if (srcDocs.Count(z=>z?.AssociatedNode?.Parent?.Parent!=null)>0)
            {
                outFileName = String.Format("CVT_{0}.pdf", srcDocs.First(z=>z?.AssociatedNode?.Parent?.Parent != null).AssociatedNode.Parent.FullPath);
            }
            else
            {
                outFileName = String.Format("CVT_{0}.pdf", Path.GetFileNameWithoutExtension(srcDocs.First(x => x.FileName != null).FileName));
            }
           

            // Create a new PDF document
            iTextDoc pdfDoc = new iTextDoc();
            PdfWriter writer = PdfWriter.GetInstance(pdfDoc, new FileStream(getFileFullPath(outFileName), FileMode.Create));
            pdfDoc.SetMargins(0, 0, 0, 0);
            pdfDoc.Open();

            foreach (string filename in srcDocs.Select(doc => doc.FileName))
            {
                string filePath = getFileFullPath(filename);
                using (var image = Image.FromFile(filePath))
                {
                    // Set page size to fit the image
                    pdfDoc.SetPageSize(new iTextRect(0, 0, image.Width, image.Height));
                    // Start new page to activiate the page size property
                    pdfDoc.NewPage();
                    pdfDoc.Add(iTextImage.GetInstance(filePath));
                }
            }

            // Save and close the PDF document
            pdfDoc.Close();

            return outFileName;
        }

        //private string StartUpload(FileEntity fileEntity, TreeNode docCatNode)
        //{
            //string empID = docCatNode.Parent.Text;
            //string docCat = docCatNode.Text;
            //string docCatAbbr = Main.DfsData["DocCatCodeDict"][docCat];
            //string targetFolder = Main.DfsData["TargetFolderDict"][docCat];
            //string subFolder = Main.DfsData["SubFolderDict"][docCat];
            //string targetFolderPath = Path.Combine(Program.AppSettings.DfsTargetFolder, cbEdpFolder.Text, empID, targetFolder, subFolder, docCat);

            //fileEntity.TargetFolderPath = Path.AltDirectorySeparatorChar + targetFolderPath.Replace(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            //fileEntity.FileName = String.Format("{0}_{1}_{2}{3}", empID, docCatAbbr, DateTime.Now.ToString("yyyyMMddHHmmss"), Path.GetExtension(fileEntity.Source));
            //fileEntity.ContentType = ContentUtil.GetFileFormat(fileEntity.Source);
            //fileEntity.FileContent = ContentUtil.GetBinaryContent(fileEntity.Source, fileEntity.ContentType);

            //// Fill in metadata for each file
            //fileEntity.StringProperties.Add("object_name", fileEntity.FileName);
            //fileEntity.StringProperties.Add("a_content_type", fileEntity.ContentType);
            //fileEntity.StringProperties.Add("hr_employee_id", empID);
            //fileEntity.StringProperties.Add("hr_document_type", docCat);
            //fileEntity.StringProperties.Add("hr_upload_by", Main.LoggedUser.Name);

            //// Create new DFS session for each document to be uploaded
            //var newDfsUtil = new DfsUtil(CmsUtil.serverURI, CmsUtil.userName, CmsUtil.password, CmsUtil.repository);
            //return newDfsUtil.ImportDocument(fileEntity);
        //}

        //private void PostUploadClearing(TreeNode docCatNode)
        //{
        //    // Delete the document category separator file
        //    var docCatFile = DocCatFileDict.Where(docCat => docCat.Value.Node == docCatNode).FirstOrDefault();
        //    FileUtil.Delete(getFileFullPath(docCatFile.Key));
        //    if (docCatFile.Value.WithPdf)
        //    {
        //        FileUtil.Delete(getFileFullPath(docCatFile.Value.PdfFileName));
        //    }
        //    DocCatFileDict.Remove(docCatFile.Key);

        //    // Delete all document files (image format only) under the specified document category node
        //    foreach (TreeNode docNode in docCatNode.Nodes)
        //    {
        //        var docFile = DocFileDict.Where(doc => doc.Value.AssociatedNode == docNode).FirstOrDefault();
        //        string docFullPath = getFileFullPath(docFile.Key);
        //        if (FileUtil.IsImage(docFullPath))
        //        {
        //            FileUtil.Delete(docFullPath);
        //        }
        //        DocFileDict.Remove(docFile.Key);
        //    }

        //    // If the specified document category node is the only one of its parent, delete the associated employee separator file
        //    TreeNode topNode = docCatNode.Parent;
        //    if (topNode.Nodes.Count <= 1)
        //    {
        //        if (topNode.Text != "Undefined")
        //        {
        //            var empFile = EmpFileDict.Where(emp => emp.Value.Node == topNode).FirstOrDefault();
        //            FileUtil.Delete(getFileFullPath(empFile.Key));
        //            if (empFile.Value.PdfFileName != null)
        //            {
        //                FileUtil.Delete(getFileFullPath(empFile.Value.PdfFileName));
        //            }
        //            EmpFileDict.Remove(empFile.Key);
        //        }

        //        // Remove all level nodes
        //        topNode.Remove();
        //    }
        //    else
        //    {
        //        // Retain the top node
        //        docCatNode.Remove();
        //    }
        //}

        //private void PostUploadClearing(TreeNode[] docCatNodesLeft)
        //{
        //    var oldEmpFileList = EmpFileDict;
        //    var oldDocCatFileList = DocCatFileDict;
        //    var oldDocFileList = DocFileDict;

        //    // Update the document category list according to the remaining nodes
        //    var docCatsToBeLeft = DocCatFileDict.Where(docCat => docCatNodesLeft.Contains(docCat.Value.Node));
        //    DocCatFileDict = docCatsToBeLeft.ToDictionary(docCat => docCat.Key, docCat => docCat.Value);
        //    // Extract filenames (= keys) from each item of the document category list
        //    //var docCatFilesToBeLeft = DocCatFileList.Select(docCat => docCat.Key);

        //    // Get parent nodes
        //    TreeNode[] empNodesLeft = docCatNodesLeft.Select(node => node.Parent).Distinct().ToArray();
        //    // Update the employee list according to the remaining nodes
        //    var empsToBeLeft = EmpFileDict.Where(emp => empNodesLeft.Contains(emp.Value.Node));
        //    EmpFileDict = empsToBeLeft.ToDictionary(emp => emp.Key, emp => emp.Value);
        //    // Extract filenames (= keys) from each item of the employee list
        //    //var empFilesToBeLeft = EmpFileList.Select(emp => emp.Key);

        //    string[] docFilesToBeLeft = {};
        //    foreach (TreeNode docCatNodeLeft in docCatNodesLeft)
        //    {
        //        // Get child nodes
        //        TreeNode[] docNodesLeft = docCatNodeLeft.Nodes.Cast<TreeNode>().ToArray();
        //        // Prepare a document list for each document category
        //        var docsToBeLeft = DocFileDict.Where(doc => docNodesLeft.Contains(doc.Value.AssociatedNode));
        //        // Extract filenames (= keys) from each item of the document list
        //        docFilesToBeLeft.Concat(docsToBeLeft.Select(doc => doc.Key));
        //    }
        //    // Update the document list according to the document files to be left
        //    DocFileDict = docFilesToBeLeft.ToDictionary(file => file, file => DocFileDict[file]);

        //    // Delete document (image) files which are no longer remained in the document list

        //    // Delete the separater files which employee or document category are no longer remained in the list
        //    var MetaDocFiles = EmpFileDict.Values.Cast<MetaDocument>().Concat(DocCatFileDict.Values.Cast<MetaDocument>());
        //    var mtDocImgToBeLeft = docCatsToBeLeft.Select(docCat => docCat.Key).Concat(empsToBeLeft.Select(emp => emp.Key));
        //    var mtDocPdfToBeLeft = docCatsToBeLeft.Select(docCat => docCat.Value.PdfFileName).Concat(empsToBeLeft.Select(emp => emp.Value.PdfFileName));
        //    string[] mtDocFilesToBeLeft = mtDocImgToBeLeft.Concat(mtDocPdfToBeLeft).ToArray();

        //    foreach (string fileName in oldDocFileList.Select(file => file.Key))
        //    {
        //        if (!docFilesToBeLeft.Contains(fileName))
        //        {
        //            if (FileUtil.IsImage(fileName))
        //            {
        //                FileUtil.Delete(getFileFullPath(fileName));
        //                FileUtil.Delete(getCropFullPath(fileName));

        //                if (oldDocFileList[fileName].WithPdf)
        //                {
        //                    // Retain the original document if it is a PDF
        //                    docFilesToBeLeft = docFilesToBeLeft.Append(oldDocFileList[fileName].PdfFileName).ToArray();
        //                }
        //            }
        //            else
        //            {
        //                // Retain the document if it is neither an image nor a PDF
        //                docFilesToBeLeft = docFilesToBeLeft.Append(fileName).ToArray();
        //            }
        //        }
        //    }
        //    var allTempFiles = new DirectoryInfo(fileOutDir).GetFiles();
        //    foreach (string fileName in allTempFiles.Select(file => file.Name).Except(docFilesToBeLeft))
        //    {
        //        if (!mtDocFilesToBeLeft.Contains(fileName))
        //        {
        //            FileUtil.Delete(getFileFullPath(fileName));
        //        }
        //    }
        //}

        #endregion

        #endregion


        ///////////////////////////////////////////////////////////////////////////////
        // Private Definitons
        ///////////////////////////////////////////////////////////////////////////////
        #region Private Definitons

        /// <summary>
        /// Our button states...
        /// </summary>
        private enum EBUTTONSTATE
        {
            CLOSED,
            OPEN,
            SCANNING,
            UPLOADING
        }

        #endregion


        ///////////////////////////////////////////////////////////////////////////////
        // Private Attributes
        ///////////////////////////////////////////////////////////////////////////////
        #region Private Attributes

        ///<summary>
        /// Fixed path for image output directory of scanned or imported documents.
        ///</summary>
        private static string fileOutDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "temp");
        private static Func<string, string> getFileFullPath = filename => Path.Combine(fileOutDir, filename);
        private static string cropOutDir = Path.Combine(fileOutDir, "cropped");
        private static Func<string, string> getCropFullPath = filename => Path.Combine(cropOutDir, filename);

        /// <summary>
        /// Use if something really bad happens.
        /// </summary>
        private bool m_blExit;

        /// <summary>
        /// Our interface to TWAIN.
        /// </summary>
        private TWAIN m_twain;
        private IntPtr m_intptrHwnd;
        private bool m_blDisableDsSent = false;
        private bool m_blXferReadySent = false;
        private IntPtr m_intptrXfer = IntPtr.Zero;
        private IntPtr m_intptrImage = IntPtr.Zero;
        private int m_iImageBytes = 0;
        private TWAIN.TW_SETUPMEMXFER m_twsetupmemxfer;

        /// <summary>
        /// We use this name (modified and made file system safe)
        /// as the place where we'll put customdsdata.
        /// </summary>
        private string m_szProductDirectory;

        /// <summary>
        /// If true, then show the driver's window messages while
        /// we're scanning.  Set this in the constructor.
        /// </summary>
        private bool m_blIndicators;

        /// <summary>
        /// Stuff used to display the images.
        /// </summary>
        private Bitmap m_bitmapGraphic1;
        private Bitmap m_bitmapGraphic2;
        private Graphics m_graphics1;
        private Graphics m_graphics2;
        private Brush m_brushBackground;
        private Rectangle m_rectangleBackground;
        //        private int m_iUseBitmap;

        /// <summary>
        /// Counter attributes for capturing workflow.
        /// </summary>
        private int imageScanCount = 0;
        private int fileSaveCount = 0;
        private int fileSkipCount = 0;

        /// <summary>
        /// We use this to run code in the context of the caller's UI thread.
        /// </summary>
        /// <param name="a_object">object (really a control)</param>
        /// <param name="a_action">code to run</param>
        public delegate void RunInUiThreadDelegate(Object a_object, Action a_action);


        #endregion
    }
}
