from playsound import playsound
from datetime import datetime
import time

alert = '02:39'

while True:
    localtime =datetime.now().strftime('%H:%M')
    if localtime == alert:
        playsound('background.wav')
        break
    else:
        print("Henüz değil")
        time.sleep(25)

    