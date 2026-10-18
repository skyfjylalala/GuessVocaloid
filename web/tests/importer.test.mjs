import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRow,safeVideoUrl,sqlQuote} from '../scripts/catalog-utils.mjs';

const row={id:1501,name:'ローリンガール',defaultName:'ローリンガール',songType:'Original',publishDate:'2010-02-14',lengthSeconds:196,minMilliBpm:195000,maxMilliBpm:195000,
  artists:JSON.stringify([
    {name:'Miku',categories:'Vocalist',isSupport:false,artist:{id:1,artistType:'Vocaloid'}},
    {name:'GUMI',categories:'Vocalist',isSupport:true,artist:{id:3,artistType:'Vocaloid'}},
    {name:'wowaka',categories:'Producer, Illustrator',effectiveRoles:'Composer, Illustrator, Lyricist',artist:{id:53,artistType:'Producer'}},
    {name:'illustrator',categories:'Illustrator',effectiveRoles:'Illustrator',artist:{id:99,artistType:'Illustrator'}},
  ]),
  pvs:JSON.stringify([{url:'http://www.nicovideo.jp/watch/sm9714351',pvType:'Original',service:'NicoNicoDouga',disabled:false},{url:'https://youtu.be/reprint',pvType:'Reprint',service:'Youtube'}]),
  views:JSON.stringify({NicoNicoDouga:[{url:'https://www.nicovideo.jp/watch/sm9714351',views:1500000}],Youtube:[{url:'https://youtu.be/reprint',views:99999999}]}),
  additionalNames:'Rolling Girl, 翻滚少女',
};
test('importer uses original-video view counts and ignores backing vocals and illustrators',()=>{
  const song=normalizeRow(row);
  assert.deepEqual(song.vocalists,[{id:1,name:'Miku'}]);
  assert.deepEqual(song.producers,[{id:53,name:'wowaka'}]);
  assert.deepEqual(song.views,{NicoNicoDouga:1500000});
  assert.equal(song.bpmMin,195); assert.equal(song.year,2010);
  assert.ok(song.aliases.includes('翻滚少女'));
  assert.equal(song.links[0].url,'https://www.nicovideo.jp/watch/sm9714351');
});
test('covers, popular reprints without popular originals, missing data and unsafe URLs are handled',()=>{
  assert.equal(normalizeRow({...row,songType:'Cover'}),null);
  assert.equal(normalizeRow({...row,views:JSON.stringify({Youtube:[{url:'https://youtu.be/reprint',views:99999999}]})}),null);
  const missing=normalizeRow({...row,minMilliBpm:null,maxMilliBpm:null,lengthSeconds:0,publishDate:null});
  assert.equal(missing.bpmMin,null); assert.equal(missing.lengthSeconds,null); assert.equal(missing.year,null);
  for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=x','https://user:pass@youtube.com/watch?v=x']) assert.equal(safeVideoUrl(url),null);
  assert.equal(sqlQuote("O'Hara"),"'O''Hara'");
});
test('voicebank editions share character identity while arrangers and tuning producers keep their credits',()=>{
  const artists=JSON.parse(row.artists);
  artists[0]={...artists[0],name:'初音ミク V4X (Original)',artist:{id:50234,name:'初音ミク V4X (Original)',artistType:'Vocaloid'}};
  artists.push({name:'GHOST',categories:'Producer, Animator',effectiveRoles:'Arranger, VoiceManipulator',artist:{id:26895,artistType:'Producer'}});
  const song=normalizeRow({...row,artists:JSON.stringify(artists)});
  assert.deepEqual(song.vocalists,[{id:1,name:'初音ミク'}]);
  assert.ok(song.producers.some(artist=>artist.id===26895));
  const generic=normalizeRow({...row,artists:JSON.stringify([{name:'Fred',categories:'Vocalist',artist:{id:117285,artistType:'OtherVoiceSynthesizer'}},artists[2]])});
  assert.equal(generic,null);
});
