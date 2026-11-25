// Terra Incognita — die 16 Offiziere. Man trifft sie in Häfen, Dörfern und bei Einsiedlern ihres Gebiets.
import type { Offizier } from '../kern/schiff'

export const OFFIZIERE: readonly Offizier[] = [
  { id: 'hinnerk', name: 'Hinnerk Paulsen', rolle: 'koch', rang: 1, heuer: 150, gebiete: [0, 1, 5], text: 'Kocht aus drei Zwiebeln und einem Hering ein Festessen. Schweigt beim Rühren.' },
  { id: 'babette', name: 'Babette Duval', rolle: 'koch', rang: 2, heuer: 2400, gebiete: [6, 7], text: 'War Köchin eines Gouverneurs. Bei ihr verdirbt nichts, nicht einmal die Laune.' },
  { id: 'jens', name: 'Jens Brodersen', rolle: 'ausguck', rang: 1, heuer: 220, gebiete: [0, 1, 3], text: 'Sieht eine Möwe, bevor sie losfliegt. Redet leider auch darüber.' },
  { id: 'aiyana', name: 'Aiyana', rolle: 'ausguck', rang: 2, heuer: 3000, gebiete: [8, 9, 2], text: 'Aufgewachsen auf einer Insel ohne Namen. Liest Wolken wie andere die Zeitung.' },
  { id: 'tjark', name: 'Tjark Ohlsen', rolle: 'zimmermann', rang: 1, heuer: 260, gebiete: [0, 3, 4], text: 'Hat jede Planke dieses Schiffes schon einmal in der Hand gehabt. Behauptet er.' },
  { id: 'old-mats', name: 'Der alte Mats', rolle: 'zimmermann', rang: 2, heuer: 2800, gebiete: [1, 2, 8], text: 'Baute Walfänger im Eismeer. Flickt ein Leck, während andere es noch suchen.' },
  { id: 'friederike', name: 'Friederike Lund', rolle: 'kartograph', rang: 1, heuer: 380, gebiete: [0, 4, 5], text: 'Zeichnet Küsten aus dem Gedächtnis. Die Gilde reißt sich um ihre Blätter.' },
  { id: 'ibn-rashid', name: 'Yusuf ibn Rashid', rolle: 'kartograph', rang: 2, heuer: 4200, gebiete: [6, 7, 9], text: 'Gelehrter, Sternkundiger, Kartenmeister. Seine Karten hängen in Palästen.' },
  { id: 'klaas', name: 'Klaas Petersen', rolle: 'navigator', rang: 1, heuer: 420, gebiete: [0, 1, 5, 3], text: 'Kreuzt gegen den Wind, als wäre es ein Tanz. Kennt jede Strömung der Heimatsee.' },
  { id: 'isabella', name: 'Isabella de Souza', rolle: 'navigator', rang: 2, heuer: 5000, gebiete: [6, 7, 8], text: 'Umsegelte Kaps, die auf keiner Karte stehen. Der Wind scheint ihr zu gehorchen.' },
  { id: 'greta', name: 'Greta Thomsen', rolle: 'dolmetscher', rang: 1, heuer: 340, gebiete: [0, 4, 5], text: 'Feilscht in sieben Sprachen und lächelt in allen.' },
  { id: 'mei', name: 'Mei Lin', rolle: 'dolmetscher', rang: 2, heuer: 4600, gebiete: [7, 9, 6], text: 'Tochter eines Teehändlers. Kennt den Preis jeder Ware, bevor der Händler ihn nennt.' },
  { id: 'ole', name: 'Ole Quast', rolle: 'quartiermeister', rang: 1, heuer: 300, gebiete: [0, 3, 5, 1], text: 'Staut Fässer wie andere Leute Bauklötze. Findet immer noch eine Ecke.' },
  { id: 'rosalind', name: 'Rosalind Hale', rolle: 'quartiermeister', rang: 2, heuer: 3600, gebiete: [4, 6, 8], text: 'Führte die Bücher einer Handelskompanie. Auf ihrem Schiff geht kein Zoll Raum verloren.' },
  { id: 'dorothea', name: 'Dr. Dorothea Wrede', rolle: 'arzt', rang: 1, heuer: 360, gebiete: [0, 4, 1], text: 'Studierte heimlich, praktiziert offen. Ihr Zitronenfass hat schon manche Fahrt gerettet.' },
  { id: 'anselm', name: 'Bruder Anselm', rolle: 'arzt', rang: 2, heuer: 3400, gebiete: [2, 9, 7], text: 'Ein Mönch, der die Welt sehen wollte. Heilt mit Kräutern, Geduld und sehr starkem Tee.' },
]

export const offizier = (id: string): Offizier | undefined => OFFIZIERE.find(o => o.id === id)
