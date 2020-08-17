# RANKING DEPARTURES

for departures: ranking the next to depart; ideas:

1. define a region that includes the apron and call it toDepart
2. along with reduce/write on other routes, reduce/write for this route
3. define a sort fn that sorts to the point on the runway
4. output a sorted region toDepart which approximates the next aircraft to depart

pros: easy to implement
cons: will be inaccurate if multiple aircraft are waiting to depart


# COLLECTING API DATA

aircraft whose api data we want:

* aircraft that are departing
* aircraft that are arriving
... so pretty much everything

so...

* write a new worker--api worker
* consume the routes of a module
* every n seconds go through each route
* grab the aircraft from their stores, intersect them with the aircraft already in the API hset and take teh difference
* execute an API call onto FA for each ac in the difference set (determine if bulk API calls can occur, avoid XHR for each sep flight)
* store in a new hset the dump1090 info with an expiry of like 30 minutes

notes:

* this worker only runs when a certain flag is enabled; don't want api data all the time, will cost $$$

# BROADCASTING AIRCRAFT DATA

how will the client use the data? what does it expect to receive?

* receives a hash every second

For departures:

Check if departing has an aircraft, grab that and render as "current departure"
if not, get last (???) aircraft out of departed, and render as "most recent departure"
if not, render nothing

For arrivals:
Check if arrived has an aircraft, grab that and render as "current arrival"
Also check if arriving has aircraft, grab the head and render as "next arrival"


Notes:

* investigate ws broadcast
* stringify en _entire_ payload of a single hash with routes containing their arrival/departure aircraft stores and broacast via websocket? probably