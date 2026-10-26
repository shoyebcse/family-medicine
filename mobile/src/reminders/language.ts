export type AlarmLanguage = 'en-IN' | 'hi-IN';
export function doseMessage(medicine: string, member: string, language: AlarmLanguage = 'en-IN') {
  return language === 'hi-IN'
    ? `${member.trim()}, आपकी दवा ${medicine.trim()} लेने का समय हो गया है। कृपया अपनी दवा लें।`
    : `It is time for ${medicine.trim()}. ${member.trim()}, please take your medicine.`;
}
export function testMessage(language: AlarmLanguage = 'en-IN') {
  return language === 'hi-IN'
    ? `यह केवल एक परीक्षण है। ${doseMessage('DOLO', 'Mohammad Ahmad', language)} यह केवल एक परीक्षण है।`
    : 'This is a test reminder. It is time for DOLO. Mohammad Ahmad, please take your medicine. This is only a test.';
}
