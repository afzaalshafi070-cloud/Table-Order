# Table Order ki Guide Book

## Shuru karne ka tareeqa
1. Counter Dashboard kholein.
2. Apne restaurant ka naam aur PIN daalein.
3. Naye restaurant ke liye sirf pehli dafa activation code istemal karein. Apna PIN ya recovery code kisi ghair-mutaliqa shakhs ko na dein.
4. Login ke baad neeche ya side menu se Orders, Menu, QR, Billing aur Settings kholein.

## Orders aur kitchen
- Naya order aane par order card dekhein.
- **Accept & cook** order ko tayyari mein bhejta hai.
- **Mark served** tab dabayein jab order customer ko de diya gaya ho.
- **KOT** kitchen ke liye hota hai. Is par items aur instructions hoti hain, customer ke bill ki tarah prices zaroori nahi hotin.
- **Bill** customer ki raqam, tax aur delivery charge dikhane ke liye hota hai. Print se pehle total aur order details check karein.

## Menu aur QR
- Menu Editor mein item, price, category aur availability update karein.
- Item sold out ho to usay unavailable mark karein taa-ke customer ghalti se order na kare.
- QR Center se sahi restaurant aur table ka QR banayein. QR ko print karne se pehle mobile par scan karke test karein.
- QR link ko public jagah par lagaya ja sakta hai. Staff PIN, recovery code ya admin secrets QR mein kabhi na daalein.

## Settings aur zubaan
- Settings mein Language se apni pasandeeda zubaan chunein. App ki zubaan badalne par guide book bhi usi zubaan mein khulni chahiye.
- Restaurant name, logo, tax, delivery areas, printing aur alerts ko apne business ke mutabiq set karein.
- Roman Urdu Latin letters mein likhi Urdu hai. Urdu script ke liye **اردو** chunein.

## Bill, payment aur shift
- Bill mark paid karne se pehle asal payment verify karein. Sirf customer ke screenshot par bharosa na karein.
- Shift close karne se pehle active orders, payments aur shift report check karein.
- Agar login ya data load na ho to internet connection check karein, page refresh karein aur phir login karein. SQL migration tabhi chalayein jab uski instructions aur backup samajh aa jayein.

## Agar masla ho
- Browser refresh karein aur internet check karein.
- Agar language badalne ke baad kuch alfaaz English mein rahen, to iska matlab us key ka translation abhi missing ho sakta hai. Isay translation audit mein report karein.
- Database SQL ko andazay se dobara na chalayein. Har migration ka naam, maqsad aur run order pehle check karein.

## Zaroori baat
Table Order ke buttons aur database permissions ko test kiye baghair live restaurant par naya patch deploy na karein. Customer order, KOT, bill, tax aur payment ko demo data se test karein.
