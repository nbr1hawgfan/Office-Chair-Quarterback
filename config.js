/* Office Chair QB — configuration */
const CONFIG = {
  APP_NAME: 'Office Chair QB',
  // Paste your Apps Script Web App URL here (ends in /exec). Can also be set in More → Settings.
  GAS_URL: '',
  // Extra college teams always included in the office pick'em (by school name)
  PICKEM_EXTRA_SCHOOLS: ['Tulsa', 'Nebraska', 'Oklahoma State'],
  EBAY_CARD_CATEGORY: '212' // eBay "Sports Trading Cards"
};

const LEAGUES = {
  nfl:   { key: 'nfl',   name: 'NFL', short: 'NFL', path: 'football/nfl', mode: 'week', icon: '🏈', pro: true },
  cfb:   { key: 'cfb',   name: 'College Football', short: 'CFB', path: 'football/college-football', mode: 'week', icon: '🏈', college: true, rank: true, groups: { sec: 8, all: 80 }, recruiting: true },
  nba:   { key: 'nba',   name: 'NBA', short: 'NBA', path: 'basketball/nba', mode: 'day', icon: '🏀', pro: true },
  mbb:   { key: 'mbb',   name: "Men's College Hoops", short: 'MBB', path: 'basketball/mens-college-basketball', mode: 'day', icon: '🏀', college: true, rank: true, groups: { sec: 23, all: 50 } },
  wbb:   { key: 'wbb',   name: "Women's College Hoops", short: 'WBB', path: 'basketball/womens-college-basketball', mode: 'day', icon: '🏀', college: true, rank: true, groups: { all: 50 } },
  mlb:   { key: 'mlb',   name: 'MLB', short: 'MLB', path: 'baseball/mlb', mode: 'day', icon: '⚾', pro: true },
  cbase: { key: 'cbase', name: 'College Baseball', short: 'CBASE', path: 'baseball/college-baseball', mode: 'day', icon: '⚾', college: true, rank: true },
  soft:  { key: 'soft',  name: 'College Softball', short: 'SOFTBALL', path: 'baseball/college-softball', mode: 'day', icon: '🥎', college: true, rank: true },
  nhl:   { key: 'nhl',   name: 'NHL', short: 'NHL', path: 'hockey/nhl', mode: 'day', icon: '🏒', pro: true },
  wnba:  { key: 'wnba',  name: 'WNBA', short: 'WNBA', path: 'basketball/wnba', mode: 'day', icon: '🏀', pro: true }
};
const LEAGUE_ORDER = ['nfl', 'cfb', 'nba', 'mbb', 'wbb', 'mlb', 'cbase', 'soft', 'nhl', 'wnba'];
const COLLEGE_SPORTS = ['cfb', 'mbb', 'wbb', 'cbase', 'soft'];

// SEC schools, matched by ESPN "location" (works across sports even when team IDs differ)
const SEC_SCHOOLS = ['Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU', 'Ole Miss',
  'Mississippi State', 'Missouri', 'Oklahoma', 'South Carolina', 'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt'];

// Fun names for the "pros from your school" page
const PRO_NICK = {
  'Arkansas': 'ProHawgs', 'Oklahoma': 'Pro Sooners', 'Oklahoma State': 'Pro Pokes', 'Tulsa': 'Pro Hurricane',
  'Nebraska': 'Pro Huskers', 'Alabama': 'Pro Tide', 'Tennessee': 'Pro Vols', 'LSU': 'Pro Tigers', 'Texas': 'Pro Horns'
};

const TRIVIA = [
  { q: 'Who coached Arkansas to the 1994 NCAA men\'s basketball title?', a: ['Nolan Richardson', 'Eddie Sutton', 'John Pelphrey', 'Mike Anderson'], c: 0 },
  { q: 'Arkansas beat which team in the 1994 national championship game?', a: ['Duke', 'Kentucky', 'North Carolina', 'UCLA'], c: 0 },
  { q: 'Darren McFadden finished Heisman runner-up twice playing for…', a: ['Arkansas', 'LSU', 'Oklahoma', 'Alabama'], c: 0 },
  { q: 'Arkansas baseball plays its home games at…', a: ['Baum-Walker Stadium', 'Alex Box Stadium', 'Dudy Noble Field', 'Lindsey Nelson Stadium'], c: 0 },
  { q: 'Arkansas began SEC competition in what year?', a: ['1992', '1989', '1996', '2001'], c: 0 },
  { q: 'The Battle for the Boot is Arkansas vs…', a: ['LSU', 'Ole Miss', 'Missouri', 'Texas A&M'], c: 0 },
  { q: 'What is Oklahoma\'s famous covered-wagon mascot called?', a: ['Sooner Schooner', 'Prairie Express', 'Boomer Wagon', 'Red Rider'], c: 0 },
  { q: 'How many straight Women\'s College World Series titles did Oklahoma win from 2021–2024?', a: ['4', '3', '2', '5'], c: 0 },
  { q: 'Who is Oklahoma\'s longtime head softball coach?', a: ['Patty Gasso', 'Mike White', 'Tim Walton', 'Karen Weekly'], c: 0 },
  { q: 'Oklahoma and Texas officially joined the SEC in…', a: ['2024', '2023', '2025', '2022'], c: 0 },
  { q: 'Bud Wilkinson\'s Oklahoma teams set the FBS record winning streak of…', a: ['47 games', '39 games', '34 games', '52 games'], c: 0 },
  { q: 'Which Oklahoma QB won the 2018 Heisman Trophy?', a: ['Kyler Murray', 'Baker Mayfield', 'Jalen Hurts', 'Sam Bradford'], c: 0 },
  { q: 'The Red River Rivalry (OU vs Texas) is played in which city?', a: ['Dallas', 'Austin', 'Norman', 'Fort Worth'], c: 0 },
  { q: '"Bedlam" is the rivalry between Oklahoma and…', a: ['Oklahoma State', 'Tulsa', 'Texas', 'Nebraska'], c: 0 },
  { q: 'What is Oklahoma State\'s mascot?', a: ['Pistol Pete', 'Bucky', 'Big Red', 'Smokey'], c: 0 },
  { q: 'Barry Sanders won the 1988 Heisman playing for…', a: ['Oklahoma State', 'Oklahoma', 'Nebraska', 'Tulsa'], c: 0 },
  { q: 'What is the University of Tulsa\'s nickname?', a: ['Golden Hurricane', 'Golden Eagles', 'Roughriders', 'Thunder'], c: 0 },
  { q: 'Nebraska\'s home sellout streak began in what year?', a: ['1962', '1971', '1955', '1980'], c: 0 },
  { q: 'Which coach led Nebraska to national titles in 1994, 1995 and 1997?', a: ['Tom Osborne', 'Bob Devaney', 'Frank Solich', 'Bo Pelini'], c: 0 },
  { q: 'Nebraska joined the Big Ten in…', a: ['2011', '2009', '2014', '2005'], c: 0 },
  { q: 'Bear Bryant\'s famous hat pattern is…', a: ['Houndstooth', 'Plaid', 'Herringbone', 'Pinstripe'], c: 0 },
  { q: 'How many national titles did Nick Saban win at Alabama?', a: ['6', '5', '7', '4'], c: 0 },
  { q: 'The Iron Bowl is Alabama vs…', a: ['Auburn', 'Tennessee', 'LSU', 'Georgia'], c: 0 },
  { q: 'The "Third Saturday in October" rivalry is Alabama vs…', a: ['Tennessee', 'Auburn', 'Ole Miss', 'LSU'], c: 0 },
  { q: 'Which song do Tennessee fans famously sing?', a: ['Rocky Top', 'Sweet Caroline', 'Country Roads', 'Hey Jude'], c: 0 },
  { q: 'Tennessee plays home football games at…', a: ['Neyland Stadium', 'Bryant-Denny Stadium', 'Kyle Field', 'Sanford Stadium'], c: 0 },
  { q: 'Who won the first College Football Playoff title (2014 season)?', a: ['Ohio State', 'Oregon', 'Alabama', 'Florida State'], c: 0 },
  { q: 'Who won the CFP national title for the 2023 season?', a: ['Michigan', 'Washington', 'Georgia', 'Texas'], c: 0 },
  { q: 'Patrick Mahomes played college football at…', a: ['Texas Tech', 'TCU', 'Baylor', 'Texas'], c: 0 },
  { q: 'Michael Jordan played college basketball at…', a: ['North Carolina', 'Duke', 'NC State', 'Kentucky'], c: 0 },
  { q: 'Who won Super Bowl I?', a: ['Green Bay Packers', 'Kansas City Chiefs', 'Baltimore Colts', 'Dallas Cowboys'], c: 0 },
  { q: 'Joe Namath guaranteed a Super Bowl III win for the…', a: ['New York Jets', 'Baltimore Colts', 'Miami Dolphins', 'Oakland Raiders'], c: 0 },
  { q: 'Who holds MLB\'s career home run record?', a: ['Barry Bonds', 'Hank Aaron', 'Babe Ruth', 'Alex Rodriguez'], c: 0 },
  { q: 'Cal Ripken Jr.\'s consecutive games played streak ended at…', a: ['2,632', '2,130', '2,500', '2,701'], c: 0 },
  { q: 'Which number is retired across the entire NHL?', a: ['99', '66', '9', '4'], c: 0 },
  { q: 'Three goals by one player in a hockey game is called a…', a: ['Hat trick', 'Triple play', 'Brace', 'Power play'], c: 0 },
  { q: 'How high is a regulation basketball rim?', a: ['10 feet', '9 feet', '11 feet', '10.5 feet'], c: 0 },
  { q: 'How far apart are the bases in MLB?', a: ['90 feet', '60 feet', '100 feet', '80 feet'], c: 0 },
  { q: 'NCAA softball pitching distance is…', a: ['43 feet', '40 feet', '46 feet', '60.5 feet'], c: 0 },
  { q: 'How many points is a safety worth in football?', a: ['2', '1', '3', '6'], c: 0 },
  { q: 'The Cy Young Award goes to the best…', a: ['Pitcher', 'Hitter', 'Rookie', 'Manager'], c: 0 },
  { q: 'Which trophy goes to the NHL playoff champion?', a: ['Stanley Cup', 'Lombardi Trophy', 'Larry O\'Brien Trophy', 'Commissioner\'s Trophy'], c: 0 }
];
