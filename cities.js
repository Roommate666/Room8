// ==========================================
// ZENTRALE STÄDTE-LISTE - DEUTSCHLAND
// ==========================================
// Enthält alle deutschen Städte über 20.000 Einwohner
// Plus alle Universitätsstädte

var germanCities = [
    // A
    'Aachen', 'Aalen', 'Achern', 'Achim', 'Ahaus', 'Ahlen', 'Ahrensburg',
    'Albstadt', 'Alfter', 'Alsdorf', 'Altenburg', 'Amberg', 'Andernach',
    'Annaberg-Buchholz', 'Ansbach', 'Apolda', 'Arnsberg', 'Arnstadt',
    'Aschaffenburg', 'Aschersleben', 'Attendorn', 'Augsburg', 'Aurich',
    
    // B
    'Backnang', 'Bad Dürkheim', 'Bad Hersfeld', 'Bad Homburg', 'Bad Honnef',
    'Bad Kissingen', 'Bad Kreuznach', 'Bad Mergentheim', 'Bad Nauheim',
    'Bad Neuenahr-Ahrweiler', 'Bad Oeynhausen', 'Bad Oldesloe', 'Bad Rappenau',
    'Bad Salzuflen', 'Bad Schwartau', 'Bad Segeberg', 'Bad Vilbel', 'Bad Zwischenahn',
    'Baden-Baden', 'Baesweiler', 'Balingen', 'Bamberg', 'Barsinghausen',
    'Baunatal', 'Bautzen', 'Bayreuth', 'Beckum', 'Bedburg', 'Bensheim',
    'Bergheim', 'Bergisch Gladbach', 'Bergkamen', 'Berlin', 'Bernau bei Berlin',
    'Bernburg', 'Biberach an der Riß', 'Bielefeld', 'Bietigheim-Bissingen',
    'Bingen am Rhein', 'Birkenfeld', 'Bitterfeld-Wolfen', 'Blankenburg',
    'Böblingen', 'Bocholt', 'Bochum', 'Bonn', 'Boppard', 'Borken', 'Borna',
    'Bornheim', 'Bottrop', 'Bramsche', 'Brandenburg an der Havel', 'Braunschweig',
    'Bremen', 'Bremerhaven', 'Bretten', 'Brilon', 'Bruchköbel', 'Bruchsal', 'Brühl',
    'Brunsbüttel', 'Buchen', 'Buchholz in der Nordheide', 'Bückeburg', 'Büdingen',
    'Bühl', 'Bünde', 'Büren', 'Burg', 'Burgdorf', 'Burghausen', 'Burgwedel', 'Buxtehude',
    
    // C
    'Calw', 'Castrop-Rauxel', 'Celle', 'Cham', 'Chemnitz', 'Clausthal-Zellerfeld',
    'Cloppenburg', 'Coburg', 'Coesfeld', 'Cottbus', 'Crailsheim', 'Cuxhaven',
    
    // D
    'Dachau', 'Darmstadt', 'Deggendorf', 'Delbrück', 'Delitzsch', 'Delmenhorst',
    'Dessau-Roßlau', 'Detmold', 'Dietzenbach', 'Dillingen', 'Dingolfing', 'Dinslaken',
    'Ditzingen', 'Döbeln', 'Donaueschingen', 'Dormagen', 'Dorsten', 'Dortmund',
    'Dreieich', 'Dresden', 'Dülmen', 'Düren', 'Düsseldorf', 'Duisburg',
    
    // E
    'Eberswalde', 'Eckernförde', 'Edewecht', 'Ehingen', 'Eichstätt', 'Eisenach',
    'Eisenhüttenstadt', 'Eislingen', 'Elmshorn', 'Elsdorf', 'Emden', 'Emmendingen',
    'Emmerich am Rhein', 'Emsdetten', 'Engelskirchen', 'Enger', 'Ennepetal',
    'Ennigerloh', 'Eppingen', 'Erding', 'Erftstadt', 'Erfurt', 'Erkelenz', 'Erkrath',
    'Erlangen', 'Eschborn', 'Eschweiler', 'Eschwege', 'Espelkamp', 'Essen', 'Esslingen',
    'Ettlingen', 'Euskirchen',
    
    // F
    'Falkensee', 'Fellbach', 'Filderstadt', 'Flensburg', 'Forchheim', 'Frankenberg',
    'Frankenthal', 'Frankfurt am Main', 'Frankfurt (Oder)', 'Frechen', 'Freiberg',
    'Freiburg im Breisgau', 'Freising', 'Freital', 'Freudenstadt', 'Friedberg',
    'Friedrichsdorf', 'Friedrichshafen', 'Friesoythe', 'Fröndenberg', 'Fulda',
    'Fürstenfeldbruck', 'Fürstenwalde', 'Fürth',
    
    // G
    'Gaggenau', 'Ganderkesee', 'Garbsen', 'Gardelegen', 'Garmisch-Partenkirchen',
    'Gauting', 'Geesthacht', 'Geilenkirchen', 'Geislingen', 'Geldern', 'Gelsenkirchen',
    'Georgsmarienhütte', 'Gera', 'Geretsried', 'Germering', 'Germersheim', 'Gersthofen',
    'Geseke', 'Gevelsberg', 'Gießen', 'Gifhorn', 'Gladbeck', 'Glauchau', 'Goch',
    'Göppingen', 'Görlitz', 'Goslar', 'Gotha', 'Göttingen', 'Greifswald', 'Greiz',
    'Greven', 'Grevenbroich', 'Grimma', 'Gronau', 'Groß-Gerau', 'Gummersbach',
    'Günzburg', 'Güstrow', 'Gütersloh',
    
    // H
    'Haan', 'Haar', 'Hagen', 'Halberstadt', 'Halle (Saale)', 'Haltern am See',
    'Hamburg', 'Hameln', 'Hamm', 'Hanau', 'Hannover', 'Haren', 'Harsewinkel',
    'Hattersheim', 'Hattingen', 'Heide', 'Heidelberg', 'Heidenheim', 'Heilbronn',
    'Heiligenhaus', 'Heinsberg', 'Helmstedt', 'Hemer', 'Hennef', 'Henstedt-Ulzburg',
    'Heppenheim', 'Herborn', 'Herdecke', 'Herford', 'Herne', 'Herrenberg', 'Herten',
    'Herzogenaurach', 'Herzogenrath', 'Hilden', 'Hildesheim', 'Hille', 'Hockenheim',
    'Hof', 'Hofheim', 'Homburg', 'Horb', 'Hoyerswerda', 'Hückelhoven', 'Hückeswagen',
    'Hünfeld', 'Husum',
    
    // I
    'Ibbenbüren', 'Idar-Oberstein', 'Idstein', 'Ilmenau', 'Ingelheim', 'Ingolstadt',
    'Iserlohn', 'Isernhagen', 'Itzehoe',
    
    // J
    'Jena', 'Jüchen', 'Jülich',
    
    // K
    'Kaarst', 'Kaiserslautern', 'Kaltenkirchen', 'Kamen', 'Kamenz', 'Kamp-Lintfort',
    'Karben', 'Karlsfeld', 'Karlsruhe', 'Kassel', 'Kaufbeuren', 'Kehl', 'Kelkheim',
    'Kempten', 'Kerpen', 'Kevelaer', 'Kiel', 'Kirchheim', 'Kitzingen', 'Kleve',
    'Koblenz', 'Köln', 'Königs Wusterhausen', 'Königswinter', 'Konstanz', 'Korbach',
    'Kornwestheim', 'Krefeld', 'Kreuztal', 'Kronach', 'Kulmbach',
    
    // L
    'Laatzen', 'Lage', 'Lahr', 'Lampertheim', 'Landau', 'Landsberg', 'Landshut',
    'Langen', 'Langenfeld', 'Langenhagen', 'Lauf', 'Lauenburg', 'Laupheim',
    'Lebach', 'Leer', 'Lehre', 'Leichlingen', 'Leimen', 'Leinefelde-Worbis',
    'Leinfelden-Echterdingen', 'Leipzig', 'Lemgo', 'Lengerich', 'Lennestadt',
    'Leonberg', 'Leopoldshoehe', 'Leverkusen', 'Lichtenfels', 'Limbach-Oberfrohna',
    'Limburg', 'Lindau', 'Lindlar', 'Lingen', 'Lippstadt', 'Löhne', 'Lörrach',
    'Lohmar', 'Lohne', 'Lübeck', 'Lüdenscheid', 'Lüdinghausen', 'Ludwigsburg',
    'Ludwigsfelde', 'Ludwigshafen', 'Lüneburg', 'Lünen',
    
    // M
    'Magdeburg', 'Maintal', 'Mainz', 'Mannheim', 'Marburg', 'Markkleeberg',
    'Marktheidenfeld', 'Marl', 'Meerbusch', 'Meinerzhagen', 'Meiningen', 'Meißen',
    'Melle', 'Memmingen', 'Menden', 'Meppen', 'Merzig', 'Meschede', 'Mettmann',
    'Metzingen', 'Minden', 'Moers', 'Mönchengladbach', 'Monheim', 'Moormerland',
    'Mörfelden-Walldorf', 'Mosbach', 'Mühlacker', 'Mühlhausen', 'Mühlheim', 'Mülheim',
    'München', 'Münster', 'Mutterstadt',
    
    // N
    'Nagold', 'Naumburg', 'Neckarsulm', 'Netphen', 'Nettetal', 'Neu-Isenburg',
    'Neu-Ulm', 'Neubrandenburg', 'Neuburg', 'Neufahrn', 'Neukirchen-Vluyn',
    'Neumarkt', 'Neumünster', 'Neunkirchen', 'Neuruppin', 'Neuss', 'Neustadt',
    'Neustrelitz', 'Neuwied', 'Nidda', 'Nidderau', 'Niederkassel', 'Nienburg',
    'Norden', 'Nordenham', 'Norderstedt', 'Nordhausen', 'Nordhorn', 'Northeim',
    'Nürnberg', 'Nürtingen',
    
    // O
    'Oberhausen', 'Oberkirch', 'Obertshausen', 'Oberursel', 'Ochtrup', 'Oelde',
    'Oer-Erkenschwick', 'Offenbach', 'Offenburg', 'Öhringen', 'Olching', 'Oldenburg',
    'Olpe', 'Oranienburg', 'Oschersleben', 'Osnabrück', 'Osterholz-Scharmbeck',
    'Osterode', 'Ostfildern', 'Overath', 'Oyten',
    
    // P
    'Paderborn', 'Papenburg', 'Parchim', 'Passau', 'Peine', 'Penzberg', 'Petershagen',
    'Pfaffenhofen', 'Pfarrkirchen', 'Pforzheim', 'Pfungstadt', 'Pinneberg', 'Pirmasens',
    'Pirna', 'Plauen', 'Plettenberg', 'Plochingen', 'Porta Westfalica', 'Potsdam',
    'Puchheim', 'Pulheim',
    
    // Q
    'Quedlinburg', 'Quickborn',
    
    // R
    'Radevormwald', 'Radolfzell', 'Rastatt', 'Rastede', 'Rathenow', 'Ratingen',
    'Ravensburg', 'Recklinghausen', 'Rees', 'Regensburg', 'Reinbek', 'Remagen',
    'Remscheid', 'Remseck', 'Rendsburg', 'Reutlingen', 'Rheda-Wiedenbrück', 'Rheinbach',
    'Rheinberg', 'Rheine', 'Rheinfelden', 'Rheinstetten', 'Riesa', 'Rietberg',
    'Rinteln', 'Rodgau', 'Rosenheim', 'Rösrath', 'Rostock', 'Rotenburg', 'Roth',
    'Rottenburg', 'Rottweil', 'Rüsselsheim',
    
    // S
    'Saalfeld', 'Saarbrücken', 'Saarlouis', 'Salzgitter', 'Salzwedel', 'Sangerhausen',
    'Sankt Augustin', 'Sankt Ingbert', 'Sankt Wendel', 'Schiffweiler', 'Schloß Holte-Stukenbrock',
    'Schmallenberg', 'Schönebeck', 'Schorndorf', 'Schortens', 'Schramberg', 'Schriesheim',
    'Schwabach', 'Schwäbisch Gmünd', 'Schwäbisch Hall', 'Schwandorf', 'Schwanewede',
    'Schwarzenbek', 'Schwedt', 'Schweinfurt', 'Schwelm', 'Schwerin', 'Schwerte',
    'Schwetzingen', 'Seelze', 'Seesen', 'Seevetal', 'Seligenstadt', 'Selm', 'Senden',
    'Sendenhorst', 'Siegburg', 'Siegen', 'Singen', 'Sinsheim', 'Soest', 'Solingen',
    'Soltau', 'Sondershausen', 'Sonneberg', 'Speyer', 'Springe', 'Spremberg',
    'Sprockhövel', 'Stade', 'Stadtallendorf', 'Stadthagen', 'Stadtlohn', 'Starnberg',
    'Staßfurt', 'Steinfurt', 'Steinheim', 'Stendal', 'Stolberg', 'Stralsund',
    'Straubing', 'Strausberg', 'Stuhr', 'Stuttgart', 'Suhl', 'Sundern', 'Syke',
    
    // T
    'Taunusstein', 'Teltow', 'Templin', 'Tönisvorst', 'Torgau', 'Traunreut',
    'Traunstein', 'Trier', 'Troisdorf', 'Tübingen', 'Tuttlingen',
    
    // U
    'Übach-Palenberg', 'Überlingen', 'Uelzen', 'Uetze', 'Ulm', 'Unna', 'Unterhaching',
    'Unterschleißheim',
    
    // V
    'Vaihingen', 'Vallendar', 'Vaterstetten', 'Vechta', 'Velbert', 'Verl', 'Versmold',
    'Viernheim', 'Viersen', 'Villingen-Schwenningen', 'Vlotho', 'Voerde', 'Völklingen',
    'Vreden',
    
    // W
    'Waghäusel', 'Waiblingen', 'Waldkraiburg', 'Waldshut-Tiengen', 'Wallenhorst',
    'Walsrode', 'Waltrop', 'Wandlitz', 'Wangen', 'Warburg', 'Waren', 'Warendorf',
    'Warstein', 'Wedel', 'Wedemark', 'Weener', 'Wegberg', 'Weil am Rhein', 'Weil der Stadt',
    'Weilheim', 'Weimar', 'Weingarten', 'Weinheim', 'Weinstadt', 'Weißenburg',
    'Weißenfels', 'Weiterstadt', 'Werdau', 'Werl', 'Wermelskirchen', 'Werne',
    'Wernigerode', 'Wertheim', 'Wesel', 'Wesseling', 'Westerstede', 'Westoverledingen',
    'Wetter', 'Wetzlar', 'Wiehl', 'Wiesbaden', 'Wiesloch', 'Wildeshausen',
    'Wilhelmshaven', 'Willich', 'Wilnsdorf', 'Winnenden', 'Winsen', 'Wipperfürth',
    'Wismar', 'Witten', 'Wittenberg', 'Wittlich', 'Wittmund', 'Wittstock', 'Wolfen',
    'Wolfenbüttel', 'Wolfsburg', 'Worms', 'Wülfrath', 'Wunstorf', 'Wuppertal',
    'Würselen', 'Würzburg',
    
    // X, Y, Z
    'Xanten', 'Zeitz', 'Zerbst', 'Zirndorf', 'Zittau', 'Zweibrücken', 'Zwickau'
];

// Auch als Universitätsstädte-Liste für Kompatibilität
var germanUniversityCities = germanCities;

/**
 * Erstellt ein <datalist> Element mit allen Städten
 * Verwendung:
 * <input type="text" id="city" list="citySuggestions">
 * <datalist id="citySuggestions"></datalist>
 * 
 * populateCityDatalist('citySuggestions');
 */
function populateCityDatalist(datalistId) {
    var datalist = document.getElementById(datalistId);
    if (!datalist) {
        console.error('Datalist with id "' + datalistId + '" not found');
        return;
    }
    
    datalist.innerHTML = '';
    
    for (var i = 0; i < germanCities.length; i++) {
        var option = document.createElement('option');
        option.value = germanCities[i];
        datalist.appendChild(option);
    }
}

/**
 * Erstellt ein <select> Dropdown mit allen Städten
 * Verwendung:
 * <select id="city"></select>
 * 
 * populateCitySelect('city', true); // true = "Alle Städte" Option
 */
function populateCitySelect(selectId, includeAllOption) {
    var select = document.getElementById(selectId);
    if (!select) {
        console.error('Select with id "' + selectId + '" not found');
        return;
    }
    
    select.innerHTML = '';
    
    if (includeAllOption) {
        var allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'Alle Städte';
        select.appendChild(allOption);
    }
    
    for (var i = 0; i < germanCities.length; i++) {
        var option = document.createElement('option');
        option.value = germanCities[i];
        option.textContent = germanCities[i];
        select.appendChild(option);
    }
}

/**
 * Prüft ob eine Stadt in der Liste ist
 */
function isValidCity(cityName) {
    if (!cityName) return false;
    var lowerCity = cityName.toLowerCase();
    for (var i = 0; i < germanCities.length; i++) {
        if (germanCities[i].toLowerCase() === lowerCity) {
            return true;
        }
    }
    return false;
}

/**
 * Sucht nach Städten die mit dem Suchbegriff beginnen
 */
function searchCities(query, maxResults) {
    if (!query) return [];
    maxResults = maxResults || 10;
    var results = [];
    var lowerQuery = query.toLowerCase();
    
    for (var i = 0; i < germanCities.length && results.length < maxResults; i++) {
        if (germanCities[i].toLowerCase().indexOf(lowerQuery) === 0) {
            results.push(germanCities[i]);
        }
    }
    
    // Falls weniger als maxResults, auch Städte die den Begriff enthalten
    if (results.length < maxResults) {
        for (var j = 0; j < germanCities.length && results.length < maxResults; j++) {
            if (germanCities[j].toLowerCase().indexOf(lowerQuery) > 0) {
                if (results.indexOf(germanCities[j]) === -1) {
                    results.push(germanCities[j]);
                }
            }
        }
    }
    
    return results;
}

// ES6 Export für Module (falls verwendet)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        germanCities: germanCities,
        germanUniversityCities: germanUniversityCities,
        populateCityDatalist: populateCityDatalist,
        populateCitySelect: populateCitySelect,
        isValidCity: isValidCity,
        searchCities: searchCities
    };
}
