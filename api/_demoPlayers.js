export const demoPlayers = [
  ['Aarav Mehta', 'CSE', 'Semester 4', 'D2A3'], ['Diya Shah', 'ECE', 'Semester 4', 'D3B4'],
  ['Kabir Singh', 'ME', 'Semester 6', 'D4C5'], ['Anaya Patel', 'CSE', 'Semester 2', 'D5E6'],
  ['Vivaan Rao', 'EEE', 'Semester 4', 'D6F7'], ['Isha Nair', 'IT', 'Semester 6', 'D7G8'],
  ['Arjun Das', 'CIVIL', 'Semester 2', 'D8H9'], ['Meera Jain', 'ECE', 'Semester 6', 'D9J2'],
  ['Rohan Gupta', 'CSE', 'Semester 4', 'D2K3'], ['Saanvi Roy', 'IT', 'Semester 2', 'D3L4'],
];

export const demoRows = (eventId) => demoPlayers.map(([name, branch, semester, secret_code], index) => ({
  event_id: eventId, name, branch, semester, secret_code, email: `demo-player-${index + 1}@tinkerbingo.test`,
}));
