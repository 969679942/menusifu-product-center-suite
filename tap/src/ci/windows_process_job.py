"""Kill owned subprocess trees when the supervising worker exits, including crashes."""
import ctypes
from ctypes import wintypes

class ProcessJob:
    def __init__(self):
        class Basic(ctypes.Structure):
            _fields_=[('process_time',ctypes.c_int64),('job_time',ctypes.c_int64),('flags',wintypes.DWORD),
                      ('min_ws',ctypes.c_size_t),('max_ws',ctypes.c_size_t),('active',wintypes.DWORD),
                      ('affinity',ctypes.c_size_t),('priority',wintypes.DWORD),('scheduling',wintypes.DWORD)]
        class IO(ctypes.Structure):
            _fields_=[(n,ctypes.c_uint64) for n in ['read_ops','write_ops','other_ops','read_bytes','write_bytes','other_bytes']]
        class Extended(ctypes.Structure):
            _fields_=[('basic',Basic),('io',IO),('process_memory',ctypes.c_size_t),('job_memory',ctypes.c_size_t),('peak_process',ctypes.c_size_t),('peak_job',ctypes.c_size_t)]
        self.api=ctypes.WinDLL('kernel32',use_last_error=True)
        self.api.CreateJobObjectW.restype=wintypes.HANDLE
        self.api.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR]
        self.api.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
        self.api.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE]
        self.api.CloseHandle.argtypes=[wintypes.HANDLE]
        self.handle=self.api.CreateJobObjectW(None,None)
        limits=Extended();limits.basic.flags=0x2000
        if not self.handle or not self.api.SetInformationJobObject(self.handle,9,ctypes.byref(limits),ctypes.sizeof(limits)):raise ctypes.WinError(ctypes.get_last_error())
    def attach(self, process):
        if not self.api.AssignProcessToJobObject(self.handle,int(process._handle)):
            process.kill();raise ctypes.WinError(ctypes.get_last_error())
    def close(self):
        if self.handle:self.api.CloseHandle(self.handle);self.handle=None
