#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <iostream>
#include <string>
#include <vector>
#include <unordered_set>

#pragma comment(lib, "psapi.lib")

// Helper function to convert wide string to UTF-8
std::string WideToUtf8(const std::wstring &wide)
{
   if (wide.empty())
      return std::string();

   int size = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, nullptr, 0, nullptr, nullptr);
   std::string result(size - 1, 0);
   WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, &result[0], size, nullptr, nullptr);
   return result;
}

struct WindowInfo
{
   HWND windowHandle;
   std::string windowTitle;
   std::string processName;
   DWORD processId;
};

BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam)
{
   std::vector<WindowInfo> *windows = reinterpret_cast<std::vector<WindowInfo> *>(lParam);

   // Check if window is visible and has a title
   if (IsWindowVisible(hwnd))
   {
      char windowTitle[256];
      GetWindowTextA(hwnd, windowTitle, sizeof(windowTitle));

      // Skip windows without titles or with empty titles
      if (strlen(windowTitle) > 0)
      {
         WindowInfo info;
         info.windowHandle = hwnd;
         info.windowTitle = windowTitle;

         // Get process ID
         GetWindowThreadProcessId(hwnd, &info.processId);

         // Get process name
         HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, info.processId);
         if (hProcess)
         {
            char processName[MAX_PATH];
            if (GetModuleBaseNameA(hProcess, NULL, processName, sizeof(processName)))
            {
               info.processName = processName;
            }
            else
            {
               info.processName = "Unknown";
            }
            CloseHandle(hProcess);
         }
         else
         {
            info.processName = "Unknown";
         }

         windows->push_back(info);
      }
   }

   return TRUE; // Continue enumeration
}

void PrintApplicationsWithWindows(const std::vector<WindowInfo> &apps)
{
   for (const auto &app : apps)
   {
      std::cout
          << app.processId << ";"
          << (unsigned long)app.windowHandle << ";"
          << app.windowTitle << "\n";
   }
}

int main()
{
   // Set console to UTF-8 for proper character display
   SetConsoleOutputCP(CP_UTF8);

   // Enumerate windows to get all windows with titles
   std::vector<WindowInfo> windowApps;
   EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&windowApps));

   // Filter only windows with titles (no duplicate removal)
   std::vector<WindowInfo> appsWithTitles;
   for (const auto &app : windowApps)
   {
      if (!app.windowTitle.empty())
      {
         appsWithTitles.push_back(app);
      }
   }

   PrintApplicationsWithWindows(appsWithTitles);

   return 0;
}
