/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Захват звука только одного процесса и его дочерних (WASAPI process loopback, Windows 10 2004+).
// Запуск: audioTap.exe <pid>. В stderr первой строкой пишет "format <rate> <channels>",
// в stdout — сырой PCM s16le. Завершается, когда родитель закрывает stdin.
// Собирается встроенным в Windows csc.exe (.NET Framework 4), поэтому синтаксис C# 5.

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace SudoCordAudioTap
{
    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr handle);
        [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig] int GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation);
    }

    // Колбэк активации приходит из чужого потока, поэтому обработчик обязан быть agile
    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    [ComVisible(true)]
    class CompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
        public int Result = unchecked((int)0x80004005);
        public object Client;

        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
        {
            int activateResult;
            object client;
            int hr = operation.GetActivateResult(out activateResult, out client);
            Result = hr < 0 ? hr : activateResult;
            Client = client;
            Done.Set();
        }
    }

    static class Program
    {
        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
        static extern void ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation operation);

        [DllImport("kernel32.dll")]
        static extern IntPtr CreateEvent(IntPtr attributes, bool manualReset, bool initialState, string name);

        [DllImport("kernel32.dll")]
        static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        const uint STREAMFLAGS_LOOPBACK = 0x00020000;
        const uint STREAMFLAGS_EVENTCALLBACK = 0x00040000;
        const uint STREAMFLAGS_SRC_DEFAULT_QUALITY = 0x08000000;
        const uint STREAMFLAGS_AUTOCONVERTPCM = 0x80000000;
        const uint BUFFERFLAGS_SILENT = 0x2;
        const long BUFFER_DURATION = 2000000; // 200 мс в единицах по 100 нс

        static void Check(int hr, string what)
        {
            if (hr < 0) throw new Exception(what + " failed: 0x" + hr.ToString("X8"));
        }

        [MTAThread]
        static int Main(string[] args)
        {
            uint pid;
            if (args.Length < 1 || !uint.TryParse(args[0], out pid))
            {
                Console.Error.WriteLine("error: usage: audioTap <pid>");
                return 2;
            }

            try
            {
                return Run(pid);
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("error: " + e.Message);
                return 1;
            }
        }

        static IAudioClient Activate(uint pid)
        {
            // AUDIOCLIENT_ACTIVATION_PARAMS: тип PROCESS_LOOPBACK, pid, режим INCLUDE_TARGET_PROCESS_TREE
            IntPtr activation = Marshal.AllocHGlobal(12);
            Marshal.WriteInt32(activation, 0, 1);
            Marshal.WriteInt32(activation, 4, (int)pid);
            Marshal.WriteInt32(activation, 8, 0);

            // PROPVARIANT с VT_BLOB, указывающий на параметры выше
            IntPtr variant = Marshal.AllocHGlobal(24);
            for (int i = 0; i < 24; i += 4) Marshal.WriteInt32(variant, i, 0);
            Marshal.WriteInt16(variant, 0, 65);
            Marshal.WriteInt32(variant, 8, 12);
            Marshal.WriteIntPtr(variant, IntPtr.Size == 8 ? 16 : 12, activation);

            CompletionHandler handler = new CompletionHandler();
            IActivateAudioInterfaceAsyncOperation operation;
            ActivateAudioInterfaceAsync("VAD\\Process_Loopback", typeof(IAudioClient).GUID, variant, handler, out operation);

            if (!handler.Done.WaitOne(5000)) throw new Exception("activation timed out");
            Check(handler.Result, "ActivateAudioInterfaceAsync");
            return (IAudioClient)handler.Client;
        }

        static IntPtr MakeFormat(int rate, int channels)
        {
            // WAVEFORMATEX, PCM 16 бит
            IntPtr format = Marshal.AllocHGlobal(18);
            Marshal.WriteInt16(format, 0, 1);
            Marshal.WriteInt16(format, 2, (short)channels);
            Marshal.WriteInt32(format, 4, rate);
            Marshal.WriteInt32(format, 8, rate * channels * 2);
            Marshal.WriteInt16(format, 12, (short)(channels * 2));
            Marshal.WriteInt16(format, 14, 16);
            Marshal.WriteInt16(format, 16, 0);
            return format;
        }

        static int Run(uint pid)
        {
            // Сначала просим сразу 16 кГц моно, это формат для Whisper. Если движок откажет — 48 кГц стерео,
            // тогда даунмикс и ресемплинг сделает плагин
            int[][] formats = new int[][] { new int[] { 16000, 1 }, new int[] { 48000, 2 } };
            IAudioClient client = null;
            int rate = 0, channels = 0, lastHr = 0;

            foreach (int[] f in formats)
            {
                IAudioClient candidate = Activate(pid);
                lastHr = candidate.Initialize(0,
                    STREAMFLAGS_LOOPBACK | STREAMFLAGS_EVENTCALLBACK | STREAMFLAGS_AUTOCONVERTPCM | STREAMFLAGS_SRC_DEFAULT_QUALITY,
                    BUFFER_DURATION, 0, MakeFormat(f[0], f[1]), IntPtr.Zero);
                if (lastHr >= 0)
                {
                    client = candidate;
                    rate = f[0];
                    channels = f[1];
                    break;
                }
                Marshal.ReleaseComObject(candidate);
            }
            Check(client == null ? lastHr : 0, "IAudioClient.Initialize");

            IntPtr ready = CreateEvent(IntPtr.Zero, false, false, null);
            Check(client.SetEventHandle(ready), "SetEventHandle");

            Guid captureIid = typeof(IAudioCaptureClient).GUID;
            object service;
            Check(client.GetService(ref captureIid, out service), "GetService");
            IAudioCaptureClient capture = (IAudioCaptureClient)service;

            Check(client.Start(), "Start");
            Console.Error.WriteLine("format " + rate + " " + channels);
            Console.Error.Flush();

            Thread watchdog = new Thread(delegate ()
            {
                try { Console.OpenStandardInput().CopyTo(Stream.Null); } catch { }
                Environment.Exit(0);
            });
            watchdog.IsBackground = true;
            watchdog.Start();

            Stream output = Console.OpenStandardOutput();
            int frameBytes = channels * 2;
            byte[] buffer = new byte[rate * frameBytes];

            while (true)
            {
                WaitForSingleObject(ready, 200);

                uint packet;
                while (true)
                {
                    Check(capture.GetNextPacketSize(out packet), "GetNextPacketSize");
                    if (packet == 0) break;

                    IntPtr data;
                    uint frames, flags;
                    ulong devicePosition, qpcPosition;
                    Check(capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition), "GetBuffer");

                    int bytes = (int)frames * frameBytes;
                    if (bytes > buffer.Length) buffer = new byte[bytes];
                    if ((flags & BUFFERFLAGS_SILENT) != 0) Array.Clear(buffer, 0, bytes);
                    else Marshal.Copy(data, buffer, 0, bytes);

                    Check(capture.ReleaseBuffer(frames), "ReleaseBuffer");
                    output.Write(buffer, 0, bytes);
                }
                output.Flush();
            }
        }
    }
}
