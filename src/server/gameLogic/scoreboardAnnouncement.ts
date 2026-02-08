/**
 * Scoreboard Announcement Generator
 *
 * Generiert deutsche Moderator-Texte für die Zwischenstand-Ansage
 * im Scoreboard zwischen den Runden.
 */

interface PlayerScore {
  name: string;
  score: number;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generiert einen TTS-Text für die Scoreboard-Ansage.
 *
 * @param players - Spieler sortiert nach Score (absteigend)
 * @returns Ansage-Text oder null bei Solo-Spieler
 */
export function generateScoreboardAnnouncement(players: PlayerScore[]): string | null {
  if (players.length <= 1) return null;

  if (players.length === 2) return generateDuelAnnouncement(players);
  if (players.length === 3) return generateTrioAnnouncement(players);
  return generateGroupAnnouncement(players);
}

function generateDuelAnnouncement(players: PlayerScore[]): string {
  const [first, second] = players;
  const gap = first.score - second.score;
  const tied = gap === 0;

  if (tied) {
    return pickRandom([
      `Gleichstand! ${first.name} und ${second.name} liegen gleichauf mit ${first.score} Punkten. Das wird spannend!`,
      `Unentschieden bei ${first.score} Punkten! ${first.name} und ${second.name} schenken sich nichts!`,
      `Kopf an Kopf! Beide mit ${first.score} Punkten. Wer zieht als Erstes davon?`,
      `${first.score} zu ${second.score} — ein Patt! Dieses Duell ist noch lange nicht entschieden!`,
    ]);
  }

  return pickRandom([
    `${first.name} führt mit ${first.score} Punkten vor ${second.name} mit ${second.score}. ${gap > 500 ? 'Ein deutlicher Vorsprung!' : 'Noch ist alles drin!'}`,
    `Spannendes Duell! ${first.name} liegt mit ${gap} Punkten vorne. Kann ${second.name} noch aufholen?`,
    `${first.name} mit ${first.score}, ${second.name} mit ${second.score} Punkten. ${gap > 300 ? 'Da muss jemand einen Zahn zulegen!' : 'Das bleibt eng!'}`,
    `Stand der Dinge: ${first.name} auf Platz 1 mit ${first.score} Punkten. ${second.name} jagt mit ${second.score} Punkten hinterher!`,
  ]);
}

function generateTrioAnnouncement(players: PlayerScore[]): string {
  const [first, second, third] = players;
  const gapTopTwo = first.score - second.score;

  return pickRandom([
    `${first.name} führt das Feld an mit ${first.score} Punkten! ${second.name} folgt mit ${second.score} und ${third.name} mit ${third.score} Punkten. ${gapTopTwo < 200 ? 'Das ist noch super eng!' : 'Aufholjagd gefragt!'}`,
    `Auf Platz 1: ${first.name} mit ${first.score} Punkten. ${second.name} liegt auf dem zweiten Platz mit ${second.score}. Und ${third.name} — ${third.score} Punkte — nicht aufgeben!`,
    `Zwischenstand! ${first.name} vorne mit ${first.score}, gefolgt von ${second.name} mit ${second.score} und ${third.name} mit ${third.score}. Alles noch möglich!`,
    `${first.name} thront mit ${first.score} Punkten an der Spitze! ${second.name} hat ${second.score} und ${third.name} kommt auf ${third.score}. ${third.name}, da geht noch was!`,
    `Die Tabelle: ${first.name} führt mit ${first.score}! Dicht dahinter ${second.name} mit ${second.score}. Und ${third.name} mit ${third.score} Punkten gibt auch nicht auf!`,
  ]);
}

function generateGroupAnnouncement(players: PlayerScore[]): string {
  const [first, second, third] = players;
  const last = players[players.length - 1];
  const gapTopTwo = first.score - second.score;

  const topThreeIntro = pickRandom([
    `Die Top 3: ${first.name} mit ${first.score}, ${second.name} mit ${second.score} und ${third.name} mit ${third.score} Punkten.`,
    `An der Spitze steht ${first.name} mit ${first.score} Punkten! Dahinter ${second.name} mit ${second.score} und ${third.name} mit ${third.score}.`,
    `${first.name} führt souverän mit ${first.score} Punkten! ${second.name} folgt mit ${second.score}, ${third.name} mit ${third.score}.`,
  ]);

  const lastPlaceComment = last.name !== third.name ? pickRandom([
    ` Und ${last.name} — mit ${last.score} Punkten — die Show ist noch nicht vorbei!`,
    ` ${last.name} bildet mit ${last.score} Punkten das Schlusslicht. Da geht noch was!`,
    ` Und ganz hinten: ${last.name} mit ${last.score} Punkten. Nicht den Kopf hängen lassen!`,
    ` ${last.name} sammelt noch Anlauf mit ${last.score} Punkten!`,
  ]) : '';

  const closingComment = pickRandom([
    gapTopTwo < 200 ? ' An der Spitze wird es richtig eng!' : '',
    ' Weiter gehts!',
    ' Mal sehen, wer sich in der nächsten Runde verbessern kann!',
    '',
  ]);

  return topThreeIntro + lastPlaceComment + closingComment;
}
