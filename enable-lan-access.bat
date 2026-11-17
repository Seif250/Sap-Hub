@echo off
title Enable LAN Access for SAP Student Hub (Port 8787)
echo Granting Windows URL reservation and Firewall rule for port 8787...
netsh http add urlacl url=http://+:8787/ user=Everyone
netsh advfirewall firewall delete rule name="SAP Student Hub (8787)" >nul 2>&1
netsh advfirewall firewall add rule name="SAP Student Hub (8787)" dir=in action=allow protocol=TCP localport=8787
echo.
echo Done! Now restart start-sap-hub.bat and open the LAN URL on your other laptop.
pause
