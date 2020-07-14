import os
import time
import threading
import blynklib
from dotenv import load_dotenv

load_dotenv()

READ_TEMP_COMMAND = "vcgencmd measure_temp"
TIMEOUT = 30  # how often to take a temp reading (seconds)
WARN_TEMP = 80.0
CRITICAL_TEMP = 85.00
NOTIFY = False

blynk = blynklib.Blynk(os.getenv("BLYNK_AUTH"))


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
        blynk.virtual_write(2, 255 if NOTIFY else 0)  # 255 for LED on, 0 for LED off
        time.sleep(1)


# handle client setting to enable or disable notifications
@blynk.handle_event('write V1')
def write_virtual_pin_handler(pin, value):
    # avert your eyes
    global NOTIFY
    NOTIFY = bool(int(value[0]))


# take core temp measurement, push results to virtual pins, and notify
# if necessary
def measure_and_notify():
    core_temp = measure_temp()
    print('Core temp: ' + str(core_temp))
    blynk.virtual_write(0, core_temp)
    global NOTIFY
    if NOTIFY and core_temp >= WARN_TEMP:
        blynk.notify("roob1090 core temp warning: {}°C".format(core_temp))
    if core_temp >= CRITICAL_TEMP:
        blynk.notify("roob1090 CRITICAL CORE TEMP ALERT: {}°C".format(core_temp))


# start the blynk thread, start the main loop that runs every TIMEOUT seconds
def main():
    blynk.run()
    threading.Thread(target=blynk_loop).start()
    while True:
        measure_and_notify()
        time.sleep(TIMEOUT)


if __name__ == "__main__":
    main()
