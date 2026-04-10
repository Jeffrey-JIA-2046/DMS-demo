using System.IO;
using System;
using System.Security.Cryptography;

namespace AutomatedSmartCapture
{
    public static class DataProtection
    {
        public static string EncryptDataAsBase64(byte[] Buffer)
        {
            if (Buffer == null)
                throw new ArgumentNullException(nameof(Buffer));
            if (Buffer.Length <= 0)
                throw new ArgumentException("The buffer length was 0.", nameof(Buffer));

            byte[] encryptedData = ProtectedData.Protect(Buffer, null, DataProtectionScope.LocalMachine);

            return Convert.ToBase64String(encryptedData);
        }

        public static int EncryptDataToStream(byte[] Buffer, byte[] Entropy, DataProtectionScope Scope, Stream S)
        {
            if (Buffer == null)
                throw new ArgumentNullException(nameof(Buffer));
            if (Buffer.Length <= 0)
                throw new ArgumentException("The buffer length was 0.", nameof(Buffer));
            if (S == null)
                throw new ArgumentNullException(nameof(S));

            int length = 0;

            // Encrypt the data and store the result in a new byte array. The original data remains unchanged.
            byte[] encryptedData = ProtectedData.Protect(Buffer, Entropy, Scope);

            // Write the encrypted data to a stream.
            if (S.CanWrite && encryptedData != null)
            {
                S.Write(encryptedData, 0, encryptedData.Length);

                length = encryptedData.Length;
            }

            // Return the length that was written to the stream.
            return length;
        }

        public static byte[] DecryptDataFromBase64(string base64)
        {
            byte[] inBuffer = Convert.FromBase64String(base64);
            try
            {
                byte[] outBuffer = ProtectedData.Unprotect(inBuffer, null, DataProtectionScope.LocalMachine);
                return outBuffer;
            }
            catch (CryptographicException ex)
            {
                ex.Data.Add(base64, inBuffer);
                throw ex;
            }
        }

        public static byte[] DecryptDataFromStream(byte[] Entropy, DataProtectionScope Scope, Stream S, int Length)
        {
            if (S == null)
                throw new ArgumentNullException(nameof(S));
            if (Length <= 0)
                throw new ArgumentException("The given length was 0.", nameof(Length));
            if (Entropy == null)
                throw new ArgumentNullException(nameof(Entropy));
            if (Entropy.Length <= 0)
                throw new ArgumentException("The entropy length was 0.", nameof(Entropy));

            byte[] inBuffer = new byte[Length];
            byte[] outBuffer;

            // Read the encrypted data from a stream.
            if (S.CanRead)
            {
                S.Read(inBuffer, 0, Length);

                outBuffer = ProtectedData.Unprotect(inBuffer, Entropy, Scope);
            }
            else
            {
                throw new IOException("Could not read the stream.");
            }

            // Return the decrypted data
            return outBuffer;
        }
    }
}