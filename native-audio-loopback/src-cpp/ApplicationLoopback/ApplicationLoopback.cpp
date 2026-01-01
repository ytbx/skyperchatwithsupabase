// ApplicationLoopback.cpp : This file contains the 'main' function. Program execution begins and ends there.
//

#include <Windows.h>
#include <iostream>
#include <io.h>
#include <psapi.h>
#include <tchar.h>
#include <fcntl.h>
#include "LoopbackCapture.h"

int wmain(int argc, wchar_t* argv[])
{
	if (argc < 2)
	{
		std::wcout << L"Usage: ApplicationLoopback.exe <processId> [include|exclude]\n";
		return 0;
	}

	DWORD processId = wcstoul(argv[1], nullptr, 0);
	if (processId == 0)
	{
		std::wcerr << L"Invalid process ID.\n";
		return 1;
	}

	bool include = true;
	if (argc >= 3) {
		if (wcscmp(argv[2], L"exclude") == 0) {
			include = false;
		}
	}

	if (_setmode(_fileno(stdout), _O_BINARY) == -1)
	{
		std::wcerr << L"Failed to set mode to binary for stdout.\n";
		return 1;
	}

	CLoopbackCapture loopbackCapture;
	HRESULT hr = loopbackCapture.StartCaptureAsync(processId, include);
	if (FAILED(hr))
	{
		wil::unique_hlocal_string message;
		FormatMessageW(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS | FORMAT_MESSAGE_ALLOCATE_BUFFER, nullptr, hr,
			MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (PWSTR)&message, 0, nullptr);
		std::wcerr << L"Failed to start capture\n0x" << std::hex << hr << L": " << message.get() << L"\n";
		return 1;
	}

	int ch = std::getchar();
	return 0;
}