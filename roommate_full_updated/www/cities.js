// ==========================================
// ZENTRALE STÄDTE-LISTE
// ==========================================
// Diese Datei wird in allen Formularen verwendet
// So sind die Städte überall gleich!

export const germanUniversityCities = [
    'Aachen',
    'Augsburg',
    'Bamberg',
    'Bayreuth',
    'Berlin',
    'Bielefeld',
    'Bochum',
    'Bonn',
    'Braunschweig',
    'Bremen',
    'Chemnitz',
    'Cottbus',
    'Darmstadt',
    'Dortmund',
    'Dresden',
    'Duisburg',
    'Düsseldorf',
    'Eichstätt',
    'Erfurt',
    'Erlangen',
    'Essen',
    'Flensburg',
    'Frankfurt am Main',
    'Frankfurt (Oder)',
    'Freiburg',
    'Fulda',
    'Gießen',
    'Göttingen',
    'Greifswald',
    'Halle',
    'Hamburg',
    'Hannover',
    'Heidelberg',
    'Hildesheim',
    'Ilmenau',
    'Ingolstadt',
    'Jena',
    'Kaiserslautern',
    'Karlsruhe',
    'Kassel',
    'Kiel',
    'Koblenz',
    'Köln',
    'Konstanz',
    'Krefeld',
    'Leipzig',
    'Lübeck',
    'Lüneburg',
    'Magdeburg',
    'Mainz',
    'Mannheim',
    'Marburg',
    'München',
    'Münster',
    'Nürnberg',
    'Oldenburg',
    'Osnabrück',
    'Paderborn',
    'Passau',
    'Potsdam',
    'Regensburg',
    'Rostock',
    'Saarbrücken',
    'Siegen',
    'Speyer',
    'Stuttgart',
    'Trier',
    'Tübingen',
    'Ulm',
    'Weimar',
    'Wuppertal',
    'Würzburg'
];

/**
 * Erstellt ein <datalist> Element mit allen Städten
 * Verwendung:
 * 
 * HTML:
 * <input type="text" id="city" list="citySuggestions">
 * <datalist id="citySuggestions"></datalist>
 * 
 * JavaScript:
 * import { populateCityDatalist } from './cities.js';
 * populateCityDatalist('citySuggestions');
 */
export function populateCityDatalist(datalistId) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) {
        console.error(`Datalist with id "${datalistId}" not found`);
        return;
    }
    
    // Lösche vorhandene Optionen
    datalist.innerHTML = '';
    
    // Füge alle Städte hinzu
    germanUniversityCities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        datalist.appendChild(option);
    });
}

/**
 * Erstellt ein <select> Dropdown mit allen Städten
 * Verwendung:
 * 
 * HTML:
 * <select id="city"></select>
 * 
 * JavaScript:
 * import { populateCitySelect } from './cities.js';
 * populateCitySelect('city', true); // true = "Alle Städte" Option hinzufügen
 */
export function populateCitySelect(selectId, includeAllOption = false) {
    const select = document.getElementById(selectId);
    if (!select) {
        console.error(`Select with id "${selectId}" not found`);
        return;
    }
    
    // Lösche vorhandene Optionen
    select.innerHTML = '';
    
    // Optional: "Alle Städte" Option
    if (includeAllOption) {
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'Alle Städte';
        select.appendChild(allOption);
    }
    
    // Füge alle Städte hinzu
    germanUniversityCities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        select.appendChild(option);
    });
}
