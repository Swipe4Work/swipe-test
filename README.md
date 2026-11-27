# Swipe4Work – feed-prototype

Prototype om te toetsen of een **feed met shortlist** prettiger voelt dan de huidige swipe-flow
(links "Niet geïnteresseerd" / rechts "Koffie doen" = direct solliciteren).

De app bevat beide varianten, zodat je ze naast elkaar kunt testen:

| Variant | URL | Wat doet de gebruiker? |
|---|---|---|
| **Feed** (nieuw) | `?v=feed` | Scrollt door vacatures, veegt interessante kaarten naar rechts = bewaren. Daarna shortlist: vergelijken (lijst of tabel, salarisbalken), weghalen, en pas dán bewust solliciteren. |
| **Swipe** (huidig) | `?v=swipe` | Links = niet interessant, rechts = "Koffie doen" (direct solliciteren). |

Zonder parameter wordt een variant willekeurig (50/50) toegewezen. `?debug` toont welke variant je hebt.

## Testopzet

Na afloop (knop **Klaar**) volgen vier vragen:

1. Hoeveel vacatures denk je gezien te hebben? ← **de kernmeting**, vergeleken met het echte aantal
2. Hoe luchtig voelde het doorkijken? (1–5)
3. Hoeveel druk voelde je om per vacature te kiezen? (1–5)
4. Hoe prettig vond je deze manier? (1–5) + open opmerking

Er staat bewust **geen teller of voortgangsbalk** in de app, anders zou je de schatting beïnvloeden.

Per sessie wordt vastgelegd: variant, echt aantal gezien, schatting + afwijking, duur, mediane tijd per vacature,
aantal keer details geopend, bewaard / weggehaald / gesolliciteerd, shortlist- en vergelijkweergaves,
swipes links/rechts, de antwoorden en een tijdlijn van alle acties (`events`).
"Gezien" = in de feed minstens 350 ms ≥60% in beeld; in de swipe-variant elke vacature waarover een keuze is gemaakt.

### Resultaten ophalen

GitHub Pages heeft geen backend. Twee manieren:

- **Zonder opzet**: op het eindscherm staat onder *Voor de testleider* een JSON-export en een CSV van alle sessies
  uit die browser. Handig voor begeleide tests op één apparaat.
- **Verzamelen op afstand**: zet in [`config.js`](config.js) een `endpoint` (bv. een Google Apps Script web-app die een rij in een Sheet schrijft, of Formspree).
  Elk afgerond resultaat wordt als JSON `POST`-verzoek (`text/plain`) naar die URL gestuurd.

## Hosten op GitHub Pages

1. Zet deze map in een GitHub-repo (`git init`, commit, push).
2. Repo → **Settings → Pages** → *Deploy from a branch* → `main` / `/ (root)`.
3. Na een minuut staat het op `https://<org>.github.io/<repo>/`. Deel de link met `?v=feed` of `?v=swipe` om een variant af te dwingen.

Alles is statisch (HTML/CSS/JS, geen build-stap). Lokaal bekijken: `python3 -m http.server 8765` en open <http://localhost:8765/?debug>.

## Vacatures

De 48 vacatures (met afbeelding, salaris, uren, opleiding en volledige tekst) komen van
[swipe4work.nl/vacatures](https://www.swipe4work.nl/vacatures/). Verversen of uitbreiden:

```bash
python3 tools/build_vacancies.py 80
```

De volgorde wordt per deelnemer willekeurig gehusseld. Aan het einde van de lijst verschijnt een eindkaart.

## Bestanden

- `index.html`, `styles.css`, `app.js`: de app (vanilla JS, geen dependencies)
- `vacancies.js`, `img/`: vacaturedata en afbeeldingen
- `fonts/`, `logo.svg`, `icon.png`: huisstijl van swipe4work.nl (Montserrat, geel `#FFC73B`, donkerblauw `#151558`)
- `config.js`: endpoint voor resultaten
