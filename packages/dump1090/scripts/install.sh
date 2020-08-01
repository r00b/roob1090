#!/bin/bash
sudo apt-get install build-essential debhelper librtlsdr-dev pkg-config dh-systemd libncurses5-dev libbladerf-dev
cd ../dump1090-fa
dpkg-buildpackage -b