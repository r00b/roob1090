import os
import time
import threading
import blynklib
from dotenv import load_dotenv

load_dotenv()

READ_TEMP_COMMAND = os.getenv("OS_TEMP")
INTERVAL = int(os.getenv("INTERVAL"))
WARN_TEMP = float(os.getenv("WARN_TEMP"))
CRITICAL_TEMP = float(os.getenv("CRITICAL_TEMP"))

blynk = blynklib.Blynk(os.getenv("BLYNK_AUTH"))
notify = False


# take temp measurement and coerce it to float
def measure_temp():
    temp = os.popen(READ_TEMP_COMMAND).readline()
    return float(temp[5:9])  # this may differ depending on the machine


# call run() frequently to keep connection alive and maintain state
def blynk_loop():
    print("Blynk maintenance thread started")
    while True:
        blynk.run()
        blynk.virtual_sync(1)  # sync V1 since it's the only control
        blynk.virtual_write(2, 255 if notify else 0)  # 255 for LED on, 0 for LED off
        time.sleep(1)


# handle client setting to enable or disable notifications
@blynk.handle_event("write V1")
def write_virtual_pin_handler(pin, value):
    # avert your eyes
    global notify
    notify = bool(int(value[0]))


# take core temp measurement, push results to virtual pins, and notify
# if necessary
def measure_and_notify():
    core_temp = measure_temp()
    print("Core temp: {}".format(core_temp), end="\r"),
    blynk.virtual_write(0, core_temp)
    global notify
    if notify and core_temp >= WARN_TEMP:
        blynk.notify("roob1090 core temp warning: {}°C".format(core_temp))
    if core_temp >= CRITICAL_TEMP:
        blynk.notify("roob1090 CRITICAL CORE TEMP ALERT: {}°C".format(core_temp))


# start the blynk thread, start the main loop that runs every INTERVAL seconds
def main():
    blynk.run()
    threading.Thread(target=blynk_loop).start()
    print("Running piTemp with interval={}s".format(INTERVAL))
    while True:
        measure_and_notify()
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
