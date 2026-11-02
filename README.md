# Kyselykarttapalvelun PoC

Selainpohjaisen ja Esrin ArcGIS Online backendin päälle rakennetun paikkatietojen kyselemiseen kehitetyn karttasovelluksen Proof Of Concept. Sovelluksen avulla voi täyttää vastaajan tiedot, piirtää
paikkatietokohteita, liittää niihin ominaisuustietoja ja säilyttää kohteita
paikallisesti sovelluksen muistissa. Lopuksi luodut paikkatietokohteet voi lähettää
ArcGIS Onlineen. Paikallinen keskeneräinen vastaus ei säily sivun päivityksen yli.

## Tiedostorakenne

```text
.
├── config.json       # Kyselyn sisältö, kentät, geometria ja kartan aloitusnäkymä
├── config.template.jsonc # Aputiedosto uuden config.json-tiedoston luomiseen
├── index.html        # Sivun runko ja ArcGIS Maps SDK:n CDN-lataus
├── src/
│   ├── app.js        # Konfiguraation tulkinta, kartta, digitointi ja vastaus
│   └── styles.css    # Kartan, lomakkeiden ja painikkeiden tyylit
└── README.md         # Käynnistys- ja testausohjeet
```

## Käynnistäminen paikallisesti

Sovellus ei tarvitse paketinhallintaa tai build-vaihetta. Tarvitset Python 3:n,
joka sisältää paikallisen HTTP-palvelimen.

1. Avaa projektikansio VS Codessa.
2. Avaa VS Coden terminaali projektikansion juureen.
3. Käynnistä palvelin:

   ```powershell
   py -m http.server 8000
   ```

   Jos `py`-komentoa ei löydy, kokeile `python -m http.server 8000`.
4. Avaa selaimessa [http://localhost:8000](http://localhost:8000).
5. Pysäytä palvelin terminaalissa näppäinyhdistelmällä `Ctrl+C`.

Käytä paikallista HTTP-palvelinta `file://`-osoitteen sijaan, jotta selain voi
ladata `config.json`-tiedoston. ArcGIS Maps SDK ja kartan taustakartta ladataan
Esrin palveluista, joten selaimella täytyy olla internet-yhteys.
Jos sovellus ei näytä viimeisimpiä käyttöliittymämuutoksia, päivitä sivu
pakotetusti näppäimillä `Ctrl+F5`.

## Uuden kyselyn luominen ja asetusten muokkaaminen

Sovellus lukee aina käynnistyessään juurikansion `config.json`-tiedoston.
Muokkaa sitä, kun haluat muuttaa tämän sovelluskopion kyselyä. Uuden kyselyn
pohjaksi käytä `config.template.jsonc`-tiedostoa: se sisältää nykyisen PoC:n
kyselyasetukset ja yleiset paikkamerkit tausta-aineiston palvelulle ja
lähdemerkinnöille.

`config.template.jsonc` on JSON with Comments -tiedosto eikä sellaisenaan kelpaa
sovelluksen lukemaksi `config.json`-tiedostoksi. Luo uusi asetustiedosto näin:

1. Kopioi `config.template.jsonc` esimerkiksi varmuuskopioksi tai työpohjaksi
   nimellä `config-new.jsonc`.
2. Muokkaa kyselyn otsikkoa, kenttiä, vaihtoehtoja, geometriaa ja muita asetuksia.
3. Siirrä JSON-objekti `config.json`-tiedostoon ilman `//`-kommenttirivejä.
   Säilytä kaikki asetusten sisällä olevat pilkut ja lainausmerkit.
4. Tarkista tiedosto VS Codessa JSON-muodossa tai komennolla
   `python -m json.tool .\config.json`. Sovellus käyttää muutoksia sivun
   uudelleenlatauksen jälkeen.

Lomakkeet, pakollisten
kenttien tarkistus, kohteiden taulukko, muokkausnäkymä ja ArcGIS-lähetyksen
ominaisuustiedot muodostetaan samoista kenttämäärityksistä.

- `appTitle` ja `questionnaire.introduction` määrittävät otsikon ja esittelytekstin.
- `questionnaire.steps` määrittää kolmen työvaiheen nimet.
- `questionnaire.respondent.fields` määrittää vastaajan kentät.
- `questionnaire.geometryType` valitsee `point`-, `polyline`- tai `polygon`-geometrian.
- `questionnaire.features.fields` määrittää digitoitavan kohteen ominaisuuskentät.
- Kentän `name` on myös ArcGIS Feature Layerin kentän nimi. Tuettuja kenttätyyppejä
  ovat `text`, `textarea`, `number`, `date`, `email`, `tel` ja `select`.
  Valintakentälle määritellään `options`-lista, jossa `value` tallentuu ja
  `label` näytetään vastaajalle.
- `required` ohjaa pakollisuutta. `validation` voi sisältää esimerkiksi
  `minLength`, `maxLength`, `min`, `max`, `step` tai `pattern`-rajoitteita.
  `helpText` näyttää kentän alla ohjeen.
- `questionnaire.help` sisältää digitointi- ja geometrian muokkausohjeet.
- `questionnaire.geometryMeasurements` määrittää johdetun mittaustiedon:
  polygonille pinta-alan ja viivalle pituuden. Pisteelle mittausta ei näytetä.
  Yksiköt ovat ArcGISin geodeettisen mittausoperaattorin yksiköitä ja
  `precision` määrittää näytettävien desimaalien määrän.
- `map.initialView` tukee joko keskipistettä ja zoomia (`type: "center"`) tai
  rajauslaatikkoa (`type: "extent"`, järjestyksessä xmin, ymin, xmax, ymax).
  Rajauslaatikon oletuskoordinaattijärjestelmä on WKID 3857; sen voi määrittää
  `wkid`-arvolla. `map.backgroundLayers` on lista itsenäisiä GeoJSON- tai
  ArcGIS Feature Layer -taustatasoja. `type` on `geojson` (oletus) tai
  `feature`; `url` on GeoJSON-tiedostopolku tai ArcGISin yksittäisen
  palvelutason REST-osoite. Kullekin määritetään otsikko, geometriatyyppi,
  piirrostyyli, oletusnäkyvyys sekä lähde- ja lisenssitiedot.
- `featureLayerUrl` osoittaa tallennuskohteeseen.
- `systemFields` nimeää sovelluksen paikallisen kohdetunnisteen ja vastauksen tunnistekentän.

Esimerkiksi valintakenttä:

```json
{
  "name": "hanke_tila",
  "label": "Hankkeen tila",
  "type": "select",
  "required": true,
  "placeholder": "Valitse tila",
  "options": [
    { "value": "suunnitteilla", "label": "Suunnitteilla" },
    { "value": "valmis", "label": "Valmis" }
  ]
}
```

Template sisältää nykyisen PoC:n kyselyasetukset kommentoituina: esimerkiksi
`geometryType: "polygon"`, pakolliset vastaajan nimikentät, kolme hankekenttää,
tilavalikon vaihtoehdot sekä polygonin pinta-alan asetukset. Aktiivinen JSON
objekti sisältää lisäksi esimerkin tausta-aineistotasosta. Korvaa siihen tausta-aineiston sisältävän
organisaation ArcGIS-palvelun URL, otsikko, lähde ja lisenssitiedot ennen
käyttöönottoa.

Kenttien nimien pitää olla yksilöllisiä, ja tallennettavien kenttien pitää
löytyä Feature Layerin skeemasta. Muuta määritykseen sopivaksi myös
`featureLayerUrl` ja `systemFields` ennen kyselyn käyttöönottoa uudella
palvelutasolla.

**Julkisesti ladattavaan asetustiedostoon ei pidä lisätä salaisuuksia tai yksityisiä tunnuksia.**

## Tausta-aineistot

Sovellus hakee tausta-aineistot organisaation ArcGIS-ympäristössä isännöidyistä
aineistoista. Tausta-aineistojen näkyvyyttä voi hallita kartan
**Karttatasot**-paneelissa. Aineistojen alkuperä ja lisensointitiedot ovat näkyvissä samaisessa paneelissa.

## Vastaajatietojen ja aluekohteen testaus

1. Käynnistä paikallinen palvelin yllä olevilla ohjeilla ja avaa sovellus.
2. Varmista, että aluksi vaihe 1 on aktiivinen ja vaiheet 2 ja 3 ovat lukittuina.
   **Luo aluekohde**-painike ei näy ennen vastaajatietojen tallennusta.
   Sovelluksen ohje- ja tilaviestit näkyvät otsakealueella vaihetietojen
   vieressä.
3. Avaa **Vastaajan tiedot**, täytä nimi ja organisaatio. Siirtymispainike
   aktivoituu vasta molempien tietojen täyttämisen jälkeen.
4. Valitse **Tallenna vastaajan tiedot**. Vaihe 2 avautuu, mutta digitointi ei
   ala automaattisesti. Tilaviesti ohjaa aloittamaan valitsemalla **Luo aluekohde** ja mainitsee **Digitointiohjeet**-painikkeen. Karttaa voi siirtää
   hiirellä vetämällä ja lähentää tai loitontaa +-painikkeilla tai hiiren
   rullalla. Piirrä alue vasemmalla hiiren painikkeella vähintään kolmella
   erillisellä pisteellä. Päätä piirto Enter-näppäimellä tai Sketchin muulla
   oletustoiminnolla.
5. Täytä hankkeen nimi ja tila. Kuvaus on vapaaehtoinen. Tallenna kohde.
6. Tarkista, että alue jää näkyviin kartalle, onnistumisilmoitus kertoo
   kohteiden määrän ja vaihe 3 avautuu vasta ensimmäisen kohteen tallennuksen
   jälkeen. **Luo aluekohde** mahdollistaa lisäpolygonien piirtämisen samoilla
   vastaajan tiedoilla.
7. Valitse **Tarkastele luotuja kohteita** otsikon alta. Taulukossa näkyvät
   luotujen kohteiden tunnisteet, hankkeen nimi, tila, kuvaus ja pinta-ala
   neliökilometreinä. Pinta-ala lasketaan geodeettisesti ja näytetään kahden
   desimaalin tarkkuudella. Vastaajan tiedot ja vastaus-ID eivät näy
   käyttöliittymässä.
8. Muokkaa hankkeen nimeä, tilaa tai kuvausta napsauttamalla solun kynäkuvaketta.
   Tallenna muutos tallennuskuvakkeesta tai peruuta solun muokkaus
   rastikuvakkeesta. Nimen ja tilan on oltava täytettyinä; tekstikentissä on
   256 merkin raja.
9. Muokkaa polygonin muotoa rivin **Muokkaa geometriaa**
   -painikkeesta. Siirrä verteksiä vetämällä, lisää verteksi napsauttamalla
   katkoviivaa tai poista verteksi napsauttamalla sitä hiiren oikealla
   painikkeella. Geometrian muokkauksen aikana otsakkeen **Geometrian muokkausohjeet** -painikkeesta saa lisäohjeita. Aluetta voi myös siirtää.
   Valitse kartan **Tallenna geometria** tallentaaksesi tai **Peruuta**
   hylätäksesi muutoksen. Pinta-ala lasketaan uudelleen geometrian tallennuksen
   yhteydessä. Muutokset vaikuttavat vain sovelluksen muistissa olevaan vastaukseen ja
   sisältyvät ArcGIS Onlineen vasta, kun lähetät vastauksen vaiheessa 3.
10. Poista kohde rivin **Poista kohde** -painikkeesta. Kartalla näkyvä
    geometria poistuu ja taulukon kohdemäärä päivittyy. Jos poistat viimeisen
    kohteen, vastauslähetys lukittuu, kunnes luot uuden kohteen.
11. Avaa **Digitointiohjeet**-painike ja varmista, että ohjeessa kerrotaan
   taitepisteistä, Enterillä viimeistelystä, peruuttamisesta ja
   virheilmoituksen jälkeisestä uudelleenpiirrosta.
12. Testaa peruutus piirtämällä toinen alue ja valitsemalla **Peruuta kohde**.
   Keskeneräisen alueen tulee poistua, mutta aiemmin tallennetun jäädä kartalle.
13. Valitse vaihe 1 eli **Vastaajan tiedot**. Tarkista tiedot, muokkaa niitä ja
   tallenna. Muutosten tulee päivittyä kaikkiin jo luotuihin kohteisiin.
   Peruuttaminen sulkee ikkunan tallentamatta lomakkeeseen tehtyjä muutoksia.
14. Vaiheen 3 **Lähetä vastaus ArcGIS Onlineen** tekee oikean tallennuksen
   julkiselle Hosted Feature Layer View -tasolle. Käytä painiketta vain, kun
   haluat lisätä kyseisen vastauskerran kohteet palveluun. Onnistuneen
   lähetyksen jälkeen avautuu **Kiitos vastauksestasi** -ikkuna, jossa
   **Sulje kysely** sulkee ilmoituksen. Lähetyksen jälkeen kaikki kolme vaihetta
   merkitään tehdyiksi passiivisina tilariveinä ja kyselyn toimintopainikkeet
   piilotetaan. Vastaajan tietoja voi muokata vaiheessa 2, mutta lähetyksen
   jälkeen vaiheet eivät ole enää painikkeita. Tilaviesti kertoo vahvistetusti
   lähetettyjen kohteiden määrän suhteessa yritettyjen määrään.

Yläreunan vaiheistus näyttää kaikki kolme vaihetta. Vaiheet 2 ja 3 ovat
lukittuina, kunnes edellinen vaihe on suoritettu. Vaihe 3,
**Vastauksen lähetys**, avautuu ensimmäisen kohteen tallennuksen jälkeen.
Onnistuneen lähetyksen jälkeen kaikki vaiheet näkyvät suoritettuina.
Lähetys käyttää ArcGIS Maps SDK:n `FeatureLayer.applyEdits()`-menetelmää
`addFeatures`-toiminnolla. Sovellus lataa palvelusta tason skeeman tarkistusta
varten, mutta ei hae tai lue palveluun tallennettuja kohteita.

Onnistuneet kohteet merkitään lähetetyiksi eikä niitä lähetetä uudelleen.
Jos lähetys epäonnistuu sen jälkeen, kun lisäyspyyntö on lähetetty, sovellus
estää saman vastauskerran uuden lähetyksen kaksoiskohteiden välttämiseksi.
Tarkista tällaisessa tilanteessa ensin tason tila. Paikallinen vastaus säilyy
sivulla, mutta tyhjentyy sivun päivityksessä.

Vastaajan ja kohteen lomakepainikkeet eivät aktivoidu ennen pakollisten tietojen
täyttämistä. Hankkeen nimi ja kuvaus on rajattu 256 merkkiin.

Sovelluksen muistissa olevia tietoja voi tarkistaa selaimen kehittäjätyökaluissa:
avaa `src/app.js`, aseta katkaisukohta kohteen tallennuksen `appState.features.push`
-riville ja tarkastele debuggerin paikallisia muuttujia. Katkaisukohdassa
`appState` sisältää vastaajan tiedot, vastauksen UUID:n ja kohdelistan.
Tarkastele `attributes`- ja `activeDraft.geometry`-arvoja sekä suorita rivi,
jotta kohde lisätään listaan. Jokaisella kohteella on oma tunniste,
ominaisuustiedot ja ArcGIS Polygon -geometria. Geometria näkyy myös kartalla.
Tiedot ovat vain sivun muistissa ja katoavat sivua päivitettäessä.

## ArcGIS Maps SDK

Sovellus käyttää ArcGIS Maps SDK for JavaScript -kirjastoa Esrin CDN:stä
versiolla 5.1. Kartta käyttää paikallista GraphicsLayer-tasoa ja
SketchViewModelia polygonin digitointiin. Geometria pidetään testipalvelun kanssa
yhteensopivassa Web Mercator -koordinaattijärjestelmässä (WKID 3857).
Polygonien pinta-ala lasketaan geodeettisella pinta-alaoperaattorilla ja
esitetään neliökilometreinä; tämä huomioi Web Mercator -koordinaattijärjestelmän
mittakaavavääristymän. ArcGIS Online -tason osoite määritellään
`config.json`-tiedoston `featureLayerUrl`-asetuksessa.

Lisätietoja: [ArcGIS Maps SDK for JavaScript: Get started](https://developers.arcgis.com/javascript/latest/get-started/)
