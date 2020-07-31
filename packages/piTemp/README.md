# piTemp

`piTemp` is a simple Python script for monitoring the core temperature of a Raspberry Pi running some Linux-based OS. This script is particularly useful for Pis placed in an outside environment. It leverages the Blynk library for monitoring and notification via a mobile application.

### Installation

#### In your shell
1. Install `python3` and `pip` via `brew`, `apt-get`, or [online](https://www.python.org/downloads/) 
2. `pip install python-dotenv blynklib`
3. `python3 src/monitor.py`

#### pipenv
1. `brew install pipenv` or `sudo apt-get install pipenv` or `pip install pipenv`
2. `pipenv shell`
3. `pipenv install`
4. `python3 src/monitor.py`