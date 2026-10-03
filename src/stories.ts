// Galgame 式漫画故事数据：36 个上海策展地标 × 4 格。
// 文本基于真实上海历史（建成年代、高度、轶事），第二人称叙事语气。
// 与 src/story-view.ts 的场景渲染配套：scene 决定 SVG 画面原型，mood 决定天色。
// 资料来源：公开史料（建造年代/高度为事实性数据）；叙事为 Demo 化的演绎。

export type StoryScene =
  | 'tower-modern' // 现代塔楼（东方明珠/上海中心/环球金融中心/金茂）
  | 'historic-row' // 历史建筑群（外滩/武康大楼/新天地）
  | 'garden' // 园林与殿宇（豫园/静安寺）
  | 'street' // 街区（南京路/人民广场）
  | 'museum'; // 文化场馆（中华艺术宫）

export type StoryMood = 'dusk' | 'night';

export interface StoryPanel {
  scene: StoryScene;
  mood: StoryMood;
  lines: string[]; // 每格 1–2 句，打字机逐字显示
}

export interface LandmarkStory {
  id: string; // 对应 landmark.id
  title: string; // 显示名（默认取地标名）
  accent: string; // 场景主色调（延续深海军蓝体系）
  panels: StoryPanel[];
}

export const stories: LandmarkStory[] = [
  {
    id: 'oriental-pearl',
    title: '东方明珠广播电视塔',
    accent: '#4a9ecf',
    panels: [
      { scene: 'tower-modern', mood: 'dusk', lines: ['你抬头的时候，十一颗大小不一的球体串在一根柱子上——上海人叫它「大珠小珠落玉盘」。', '1994 年，468 米的塔尖封顶，陆家嘴第一座真正的高塔。'] },
      { scene: 'tower-modern', mood: 'dusk', lines: ['全上海最早的城市天际线，就是从这根柱子开始往上长的。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['塔身的灯光亮起来，粉紫与亮蓝交替，像江面上漂浮的霓虹。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['后来的楼比它高得多，但人们还是先认出它。', '毕竟它长得最像一个关于未来的想象。'] },
    ],
  },
  {
    id: 'shanghai-tower',
    title: '上海中心大厦',
    accent: '#7fb8dd',
    panels: [
      { scene: 'tower-modern', mood: 'dusk', lines: ['你眼前的这栋楼，632 米，中国第一高——但它的身子是扭转的。', '从底到顶整整转了 120 度。'] },
      { scene: 'tower-modern', mood: 'dusk', lines: ['扭转不只为了好看：风绕着走，侧向力少了将近四分之一。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['顶端的观光厅高 562 米——', '人在云层之上俯看自己刚走过的街道。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['2015 年建成时，它是这片冲积平原上人类立起的最高的一点。', '你正从它的腰间飞过。'] },
    ],
  },
  {
    id: 'swfc',
    title: '上海环球金融中心',
    accent: '#c1def3',
    panels: [
      { scene: 'tower-modern', mood: 'dusk', lines: ['头顶那个矩形孔洞，上海人喊它「开瓶器」。', '492 米，2008 年落成。'] },
      { scene: 'tower-modern', mood: 'dusk', lines: ['最初的方案里，孔洞是圆的；风洞测试和预算一起说服了设计师，改成今天的梯形开口。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['风从孔洞里穿过，台风天的啸声格外清楚。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['它与金茂、上海中心并肩站着——', '人们管这三栋叫陆家嘴的「厨房三件套」。'] },
    ],
  },
  {
    id: 'jinmao',
    title: '金茂大厦',
    accent: '#8ba9c4',
    panels: [
      { scene: 'tower-modern', mood: 'dusk', lines: ['金茂的轮廓会让你想起密檐塔——它本来就以宝塔为蓝本。', '420.5 米，1999 年，浦东最早的天际线王牌。'] },
      { scene: 'tower-modern', mood: 'dusk', lines: ['塔身一段段往里收，是中国塔的比例；', '玻璃与不锈钢又把它拉回二十世纪末。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['88 层取的是「发发」的彩头。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['它曾被更高的邻居超过，但它是第一个让浦东「长高」的楼。'] },
    ],
  },
  {
    id: 'the-bund',
    title: '外滩',
    accent: '#6d93b5',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['黄浦江在这里拐了个弯，西岸就是万国建筑博览群。', '五十多栋楼，罗马式、哥特式、装饰艺术，一个世纪前在此排队。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['江边的防汛墙被叫作「情人墙」——七八十年代，情侣们在这里背对江面谈恋爱。'] },
      { scene: 'historic-row', mood: 'night', lines: ['对岸陆家嘴的灯火，是九十年代之后才有的。', '在那之前，这一侧就是上海全部的「现代」。'] },
      { scene: 'historic-row', mood: 'night', lines: ['海关大钟每刻敲一次，钟声渡过江去，又渡回来。'] },
    ],
  },
  {
    id: 'yuyuan',
    title: '豫园',
    accent: '#9ec38a',
    panels: [
      { scene: 'garden', mood: 'dusk', lines: ['三百多年前，四川布政使潘允端为父亲建了这座园子。', '「豫」取的是平安喜悦。'] },
      { scene: 'garden', mood: 'dusk', lines: ['园中那块「玉玲珑」，传是宋徽宗花石纲的遗石，瘦皱漏透。', '它一路被遗落、被深埋、被捞起，才立在这里。'] },
      { scene: 'garden', mood: 'night', lines: ['后来潘家败落，园子几度易手，成了商人们的公所与会馆。'] },
      { scene: 'garden', mood: 'night', lines: ['如今它被高楼围在中央——', '像城市心脏里，一池安静的水。'] },
    ],
  },
  {
    id: 'nanjing-road',
    title: '南京路步行街',
    accent: '#c9a876',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['你沿着这条街飞，它一直通到外滩。', '中华商业第一街，热闹了一百五十年。'] },
      { scene: 'street', mood: 'dusk', lines: ['先有路，后有楼：1851 年它还叫「花园弄」，', '是跑马场边的一条小道。'] },
      { scene: 'street', mood: 'night', lines: ['1999 年改为步行街，铸铁栏杆与老式街灯留了下来。'] },
      { scene: 'street', mood: 'night', lines: ['入夜，整条街的招牌一起亮，像一条流光的河。'] },
    ],
  },
  {
    id: 'peoples-square',
    title: '人民广场',
    accent: '#b5a8d4',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['你脚下曾是远东最大的跑马厅，看台里能坐三万人。', '1951 年跑马厅被收回，旧址慢慢变成了广场。'] },
      { scene: 'street', mood: 'dusk', lines: ['它是这座城市的中心点——', '市府大楼、博物馆与大剧院，三足鼎立。'] },
      { scene: 'street', mood: 'night', lines: ['博物馆顶的圆对着天；喷泉开的时候，整座广场漫起水汽。'] },
      { scene: 'street', mood: 'night', lines: ['这里大概是最容易放风筝的地方——', '方方正正，头顶没有楼。'] },
    ],
  },
  {
    id: 'xintiandi',
    title: '新天地',
    accent: '#c47a6a',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['石库门里，青砖与红砖交替。', '这一带旧称太平桥，曾遍布旧式里弄。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['本世纪初，它是第一批被整体改造的旧里——', '拆掉的是内部的木构，留下的是石库门门头。'] },
      { scene: 'historic-row', mood: 'night', lines: ['当年这番「掏空重建」的争议，一点也不小。'] },
      { scene: 'historic-row', mood: 'night', lines: ['如今咖啡与弄堂共存——', '你分不清是怀旧的商业，还是商业化的怀旧。'] },
    ],
  },
  {
    id: 'jingan-temple',
    title: '静安寺',
    accent: '#d4b96a',
    panels: [
      { scene: 'garden', mood: 'dusk', lines: ['你贴着鎏金的屋顶飞过。', '这间寺比上海城还老——三国东吴赤乌年间，它已在河岸边了。'] },
      { scene: 'garden', mood: 'dusk', lines: ['北宋时定名「静安」，取安宁之意。', '一条道路因寺而来：静安寺路，也就是今天的南京西路。'] },
      { scene: 'garden', mood: 'night', lines: ['它先是农田边的寺，再被城市层层包围——', '如今四面的玻璃幕墙比塔刹还高。'] },
      { scene: 'garden', mood: 'night', lines: ['大殿的柚木柱是近代从缅甸请来的；', '金顶重修过，但山门一直没挪。'] },
    ],
  },
  {
    id: 'wukang-mansion',
    title: '武康大楼',
    accent: '#a8c4c9',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['这艘「船」停在路口快一百年了。', '夹在几条马路的交汇处，设计师把整栋楼做成了三角形的巨轮。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['1924 年的诺曼底公寓，邬达克的作品。', '当年是法租界的高级公寓。'] },
      { scene: 'historic-row', mood: 'night', lines: ['沿街的弧线贴着路口转，', '骑楼里偶尔还能看到老式门灯。'] },
      { scene: 'historic-row', mood: 'night', lines: ['如今它是出镜率最高的楼——', '黄昏时，拍照的人群会在楼下排成弧线。'] },
    ],
  },
  {
    id: 'china-art-museum',
    title: '中华艺术宫',
    accent: '#d47a4a',
    panels: [
      { scene: 'museum', mood: 'dusk', lines: ['你眼前倒置的红色斗拱，是 2010 年世博会的中国馆。', '56 根柱子撑起一片「东方之冠」。'] },
      { scene: 'museum', mood: 'dusk', lines: ['世博会闭幕，别的馆陆续拆走，它被留了下来，', '改成了美术馆。'] },
      { scene: 'museum', mood: 'night', lines: ['外墙保留着「中国红」——', '黄昏时，红得比天还浓。'] },
      { scene: 'museum', mood: 'night', lines: ['如今它收的是近现代美术——', '从「海上画派」到当代，都在这片斗拱之下。'] },
    ],
  },
  // ---- 以下 12 篇为城市内容扩充（2026-10-03）----
  {
    id: 'chenghuangmiao',
    title: '城隍庙',
    accent: '#c9a876',
    panels: [
      { scene: 'garden', mood: 'dusk', lines: ['香火与小吃摊的味道混在一起——这里曾是上海老城厢的信仰中心。', '明代永乐年间，城隍庙已经香火鼎盛。'] },
      { scene: 'garden', mood: 'dusk', lines: ['庙里供奉的城隍，据说是霍光、秦裕伯与陈化成，', '一文一武一义烈，都是这座城认可的人。'] },
      { scene: 'garden', mood: 'night', lines: ['「庙市」是这里的规矩：拜完神，转身就能吃一碗蟹粉小笼。'] },
      { scene: 'garden', mood: 'night', lines: ['鼎盛时，庙前街上挤满南北杂货与金银细工，', '老上海称这里「特意跟洋场别苗头」。'] },
    ],
  },
  {
    id: 'tianzifang',
    title: '田子坊',
    accent: '#c47a6a',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['泰康路 210 弄，上世纪的里弄工厂曾经织布、制革。', '九十年代末，艺术家陆陆续续搬了进来。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['画家陈逸飞是最早的一批；', '据说「田子坊」这名字是黄永玉起的，取自古代画家田子方。'] },
      { scene: 'historic-row', mood: 'night', lines: ['石库门里挤进画廊、工作室与咖啡馆——', '房租也因此一年比一年高。'] },
      { scene: 'historic-row', mood: 'night', lines: ['有人说它太喧嚣，不再纯粹；', '但当年它确实让上海看见：弄堂可以不只是弄堂。'] },
    ],
  },
  {
    id: 'shanghai-museum',
    title: '上海博物馆',
    accent: '#b5a8d4',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['人民广场的这栋建筑，上圆下市，取的是「天圆地方」。', '1996 年新馆开放，馆里的青铜器号称江南半壁。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['大克鼎、子龙鼎……', '这些器物在地下睡了三千年，才走到这盏灯光底下。'] },
      { scene: 'historic-row', mood: 'night', lines: ['馆里最安静的时刻，是闭馆前最后一拨人散去，', '青铜鼎的阴影在玻璃上轻轻晃。'] },
      { scene: 'historic-row', mood: 'night', lines: ['它原在河南中路的旧马场大楼里，1952 年开馆，', '搬了两次家，才住进城中心。'] },
    ],
  },
  {
    id: 'xujiahui-cathedral',
    title: '徐家汇天主堂',
    accent: '#c1def3',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['两座对称的哥特尖塔，1910 年由耶稣会士建成。', '它站在这里的时候，周围还是河流与农田。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['徐家汇这名字来自徐光启——', '那位明代大学士，是最早一批受洗的天主教徒。'] },
      { scene: 'historic-row', mood: 'night', lines: ['当年它被称为「远东第一大天主堂」，', '彩色玻璃的光，落在长条木椅上。'] },
      { scene: 'historic-row', mood: 'night', lines: ['他的墓就在光启公园，离这里不远——', '科学家的墓与教堂的塔，同在一条路上。'] },
    ],
  },
  {
    id: 'fudan-university',
    title: '复旦大学',
    accent: '#9ec38a',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['「日月光华，旦复旦兮」——《尚书大传》里的这句话，成了校名。', '1905 年，马相伯办起了这所学校。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['原名复旦公学，1917 年改大学；', '抗战时一路西迁重庆北碚，胜利后又迁回江湾。'] },
      { scene: 'historic-row', mood: 'night', lines: ['相辉堂的名字，记着马相伯与李登辉两位校长，', '它是校园里最老的舞台。'] },
      { scene: 'historic-row', mood: 'night', lines: ['光华楼是后来才有的双子塔——', '二十三层，夜里灯一齐亮，像两支烛。'] },
    ],
  },
  {
    id: 'mansion-1933',
    title: '1933 老场坊',
    accent: '#a8a8a8',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['1933 年，公共租界工部局在虹口建了这座宰牲场。', '它是当时远东最大的屠宰场。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['英国人巴尔弗斯设计的「无梁楼盖」，', '四层楼由 26 座廊桥连成一座牛羊走的迷宫。'] },
      { scene: 'historic-row', mood: 'night', lines: ['被废弃了几十年，成了城市探险者的秘密据点。'] },
      { scene: 'historic-row', mood: 'night', lines: ['2008 年改造成创意园区——', '牛道还在，走的人换成了拍照的。'] },
    ],
  },
  {
    id: 'ccp-site',
    title: '中共一大会址',
    accent: '#c47a6a',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['兴业路 76 号（当年叫望志路 106 号），一栋石库门房子。', '1921 年 7 月，十三个人围在楼下长桌边开会。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['会议中途被巡捕打断，众人连夜撤往嘉兴南湖，', '在一艘游船上完成了最后的议程。'] },
      { scene: 'historic-row', mood: 'night', lines: ['1952 年，会址按原样修复，成了纪念馆。', '会议桌上的茶杯，据说摆得和当年一模一样。'] },
      { scene: 'historic-row', mood: 'night', lines: ['石库门的门楣上现在写着「树德里」——', '弄堂口的树，比那时候粗了一圈又一圈。'] },
    ],
  },
  {
    id: 'qibao-old-street',
    title: '七宝老街',
    accent: '#c9a876',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['七宝这地方，因寺成名。', '传说寺里有金字莲花经、飞来佛等「七件宝」，镇寺了千年。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['蒲汇塘桥是明正德年间修的，', '桥下流水，桥上赶集——岁月就这么淌过去。'] },
      { scene: 'historic-row', mood: 'night', lines: ['钟楼的钟，旧时是敲给四乡八镇听的。'] },
      { scene: 'historic-row', mood: 'night', lines: ['如今老街卖的是海棠糕、汤团与蹄髈，', '游客排的队，比当年的香客还长。'] },
    ],
  },
  {
    id: 'shanghai-grand-theatre',
    title: '上海大剧院',
    accent: '#b5a8d4',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['人民广场西北角，一片展开的白色弧顶。', '法国建筑师沙尔庞捷的作品，1998 年落成。'] },
      { scene: 'street', mood: 'dusk', lines: ['屋顶的弧线像一把张开的折扇，', '夜里亮起来，是整座广场最亮的一片。'] },
      { scene: 'street', mood: 'night', lines: ['它所在的地方，旧时是跑马厅的一部分。', '从马蹄声到咏叹调，中间隔了一个世纪。'] },
      { scene: 'street', mood: 'night', lines: ['大剧场、中剧场、小剧场——', '一年三百多场演出，幕布起起落落。'] },
    ],
  },
  {
    id: 'longhua-temple',
    title: '龙华寺',
    accent: '#d4b96a',
    panels: [
      { scene: 'garden', mood: 'dusk', lines: ['相传龙华寺始建于三国赤乌年间——', '比上海建县早了一千多年。'] },
      { scene: 'garden', mood: 'dusk', lines: ['七层八方的龙华塔，是宋太平兴国二年重建的，', '它站在这条路边，已经一千多年。'] },
      { scene: 'garden', mood: 'night', lines: ['「龙华晚钟」曾是沪上八景之一；', '三月三的庙会，旧时能从寺门口排到几里外。'] },
      { scene: 'garden', mood: 'night', lines: ['桃花盛开的季节，香客与游客一齐涌来，', '塔影落在放生池里，晃一晃就散了。'] },
    ],
  },
  {
    id: 'm50',
    title: 'M50 创意园',
    accent: '#7fb8dd',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['莫干山路 50 号，临着苏州河。', '1930 年代这里是纺织厂——信和纱厂。'] },
      { scene: 'street', mood: 'dusk', lines: ['烟囱不再冒烟，机器也拆了，', '2000 年前后，画家们看上了这些空厂房。'] },
      { scene: 'street', mood: 'night', lines: ['沿街的墙年年刷新涂鸦，', '有人成名的墙，也有被覆盖的角落。'] },
      { scene: 'street', mood: 'night', lines: ['画廊、工作室与直播间挤在一起——', '河水很慢，但楼里从不安静。'] },
    ],
  },
  {
    id: 'zhujiajiao',
    title: '朱家角古镇',
    accent: '#9ec38a',
    panels: [
      { scene: 'garden', mood: 'dusk', lines: ['你飞过了城市边界，来到淀山湖畔的这片水乡。', '宋元时这里已有市集，明清时繁华了几百年。'] },
      { scene: 'garden', mood: 'dusk', lines: ['放生桥是明代隆庆五年建的，五孔石拱，', '这座桥，是上海现存最大的石拱桥。'] },
      { scene: 'garden', mood: 'night', lines: ['三十六座桥的旧说法，如今数不全了；', '但桥下的水，还是直通淀山湖。'] },
      { scene: 'garden', mood: 'night', lines: ['清晨的古镇只有本地人买菜，', '游客涌进来，要等太阳升高之后。'] },
    ],
  },
  // ---- 以下 12 篇为参赛轮扩充（2026-10-03）----
  {
    id: 'dashijie',
    title: '大世界',
    accent: '#c9a876',
    panels: [
      { scene: 'tower-modern', mood: 'dusk', lines: ['1917 年，黄楚九在爱多亚路开了一家游乐场，取名「大世界」。', '哈哈镜、电影、戏曲、杂耍，全装进这一栋楼里。'] },
      { scene: 'tower-modern', mood: 'dusk', lines: ['「不到大世界，枉来大上海」——', '这句话实实在在流传了几十年。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['后来它辗转到黄金荣手中，热闹了又安静，安静了又热闹。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['2017 年修缮一新重新开门，', '哈哈镜还在，照出的是一百年后的面孔。'] },
    ],
  },
  {
    id: 'jade-buddha-temple',
    title: '玉佛禅寺',
    accent: '#d4b96a',
    panels: [
      { scene: 'garden', mood: 'dusk', lines: ['1882 年，慧根法师从缅甸请回五尊白玉佛，', '一路南下，途经上海，留下了两尊。'] },
      { scene: 'garden', mood: 'dusk', lines: ['江湾的旧寺后来毁于战火，', '1918 年，才在安远路的现址重建。'] },
      { scene: 'garden', mood: 'night', lines: ['大殿里那尊坐佛，高一米九，玉色莹润，', '从清末一直看到今天。'] },
      { scene: 'garden', mood: 'night', lines: ['香火最旺的时候，进山门要排到弄堂外头。', '闹市里的寺庙，钟声比鼓楼还慢半拍。'] },
    ],
  },
  {
    id: 'tongji-university',
    title: '同济大学',
    accent: '#9ec38a',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['1907 年，德国医生宝隆在上海办了一所德文医学堂。', '名字取自「同舟共济」——在这座水上的城市，再贴切不过。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['1927 年它成为国立大学，', '从一所医学堂，长成了工科的重镇。'] },
      { scene: 'historic-row', mood: 'night', lines: ['四平路校区的工程馆，红砖墙面爬满了常春藤。'] },
      { scene: 'historic-row', mood: 'night', lines: ['中国的桥梁与地铁，有许多是从这栋楼里画出来的。'] },
    ],
  },
  {
    id: 'binjiang-avenue',
    title: '滨江大道',
    accent: '#c1def3',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['陆家嘴这段江堤，从前只是一道防汛墙。', '九十年代，它被铺成了观景大道。'] },
      { scene: 'street', mood: 'dusk', lines: ['江风、灯塔，和对岸外滩的万国建筑，', '都装在一条长椅的视野里。'] },
      { scene: 'street', mood: 'night', lines: ['傍晚坐在这里，看华灯顺着江面一盏一盏亮起。'] },
      { scene: 'street', mood: 'night', lines: ['上海的白天属于那些高楼，', '夜晚，属于这条江。'] },
    ],
  },
  {
    id: 'shanghai-science-museum',
    title: '上海科技馆',
    accent: '#7fb8dd',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['2001 年，它在浦东世纪广场边上开了门。', '从物种演化到机器人，绕一圈要走大半天。'] },
      { scene: 'street', mood: 'dusk', lines: ['大门前的球体，是一个球幕影厅——', '能把整片星空翻进屋顶。'] },
      { scene: 'street', mood: 'night', lines: ['它是亚洲最大的科普馆之一，', '多少孩子的第一次「为什么」，是在这里问出口的。'] },
      { scene: 'street', mood: 'night', lines: ['机器人展厅的琴声，', '弹了二十多年，不用休息。'] },
    ],
  },
  {
    id: 'shanghai-ocean-aquarium',
    title: '上海海洋水族馆',
    accent: '#4a9ecf',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['2002 年开放，155 米的海底隧道，曾号称亚洲最长。', '头顶尖鳍鲨，身边游过鳐鱼，只剩一层玻璃隔着。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['五大洲的水族分装在十几个展厅里：', '从长江的中华鲟，一路看到亚马逊。'] },
      { scene: 'historic-row', mood: 'night', lines: ['在陆家嘴的钢铁楼群里，', '这里是最离大海近的地方。'] },
      { scene: 'historic-row', mood: 'night', lines: ['隧道里的蓝光打在每个人脸上，', '像海底的那种安静。'] },
    ],
  },
  {
    id: 'power-station-art',
    title: '上海当代艺术博物馆',
    accent: '#c47a6a',
    panels: [
      { scene: 'tower-modern', mood: 'dusk', lines: ['它曾是南市发电厂，那根大烟囱在天际线上画了几十年。', '世博会那年，厂房被改成了展馆。'] },
      { scene: 'tower-modern', mood: 'dusk', lines: ['烟囱被保留下来，改造成一支巨大的温度计——', '它是城市里唯一一栋会报天气的建筑。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['2012 年，它成了中国第一家公立当代艺术博物馆。'] },
      { scene: 'tower-modern', mood: 'night', lines: ['旧厂房的骨架，装着最时新的野心：', '这大概就是上海的脾性。'] },
    ],
  },
  {
    id: 'west-bund',
    title: '西岸艺术中心',
    accent: '#8ba9c4',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['徐汇滨江，从前是码头、仓库和铁轨。', '工业搬走以后，空厂房被改成了美术馆。'] },
      { scene: 'street', mood: 'dusk', lines: ['龙美术馆的清水混凝土，', '和保留下来的煤斗搭在一起。'] },
      { scene: 'street', mood: 'night', lines: ['江边的塔吊和铁轨还在原地，', '散步的人，换了一批又一批。'] },
      { scene: 'street', mood: 'night', lines: ['飞机从楼顶掠过，船在江上慢慢挪，', '这里是上海最慢的一条岸。'] },
    ],
  },
  {
    id: 'shanghai-library',
    title: '上海图书馆',
    accent: '#b5a8d4',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['上海图书馆 1952 年建馆，', '淮海中路的这栋大楼，1996 年落成。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['文献收藏以千万册计，', '书架连起来，能绕城好几圈。'] },
      { scene: 'historic-row', mood: 'night', lines: ['它有上海最安静的阅读大厅——', '窗外就是淮海路的梧桐。'] },
      { scene: 'historic-row', mood: 'night', lines: ['2022 年浦东开了东馆，', '这栋西馆，还守着老城区的读者。'] },
    ],
  },
  {
    id: 'sinan-residences',
    title: '思南公馆',
    accent: '#c9a876',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['思南路上的花园洋房，大都是 1920 年代建的。', '柳亚子、梅兰芳，都在这一带住过。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['路名来自一位法国作曲家（马斯内街），', '是法租界最早的格局马路之一。'] },
      { scene: 'historic-row', mood: 'night', lines: ['51 栋老洋房被完整保留下来，修旧如旧，2010 年开放。'] },
      { scene: 'historic-row', mood: 'night', lines: ['如今洋房里是书店与咖啡馆，', '夏夜的露天音乐会，常有爵士。'] },
    ],
  },
  {
    id: 'century-park',
    title: '世纪公园',
    accent: '#9ec38a',
    panels: [
      { scene: 'street', mood: 'dusk', lines: ['140 公顷，上海内环线里最大的一片绿地。', '2000 年开放，大家管它叫「城市的绿肺」。'] },
      { scene: 'street', mood: 'dusk', lines: ['入口的世纪花钟是地标——', '那对指针是真的在走。'] },
      { scene: 'street', mood: 'night', lines: ['镜天湖上可以放风筝，放到看不见线为止。'] },
      { scene: 'street', mood: 'night', lines: ['浦东的楼群围着它长了一圈，', '它是这一圈热闹里，唯一的一大块安静。'] },
    ],
  },
  {
    id: 'sjtu',
    title: '上海交通大学',
    accent: '#c47a6a',
    panels: [
      { scene: 'historic-row', mood: 'dusk', lines: ['1896 年，盛宣怀上奏办了南洋公学——', '这是它最早的名字。'] },
      { scene: 'historic-row', mood: 'dusk', lines: ['「交通」二字出自《易经》：', '「天地交而万物通」。'] },
      { scene: 'historic-row', mood: 'night', lines: ['徐汇校区的红砖老楼与执信西斋，', '是一百多年一层层加上去的。'] },
      { scene: 'historic-row', mood: 'night', lines: ['钱学森图书馆在校园一角，', '记着一个从这里走出去的人。'] },
    ],
  },
];

export const storyById = (id: string): LandmarkStory | undefined =>
  stories.find((s) => s.id === id);

export const hasStory = (id: string): boolean => storyById(id) !== undefined;

// 新手引导篇章：独立常量，不进 stories 数组（不参与 36 篇策展故事的触发/统计）。
// 依据 docs/DESIGN-POLISH-2026-10-03.md；2026-10-03 改为四步交互（四格漫画式：一格一点）。
// 看完（或跳过/Esc）即标记已读（id: 'onboarding'），不重复弹出。
export const ONBOARDING_STORY: LandmarkStory = {
  id: 'onboarding',
  title: '操作指引',
  accent: '#4a9ecf',
  panels: [
    {
      scene: 'tower-modern',
      mood: 'dusk',
      lines: [
        '欢迎来到上海——你正盘旋在这座城市上空。',
        '顶栏「开始城市飞行」起飞：W/S 俯仰、A/D 横滚、Shift/Ctrl 油门、空格爬升、V 座舱、Esc 退出。',
      ],
    },
    {
      scene: 'street',
      mood: 'dusk',
      lines: ['右侧搜索框能找到任何地点——在线结果也能飞过去。', '搜过的地方会收进「我的地点」，下次直接找到。'],
    },
    {
      scene: 'street',
      mood: 'night',
      lines: ['点击地标条目：既飞过去预览，也自动设为导航目标。', '飞行中 HUD 会有箭头指路，250m 内判定到达。'],
    },
    {
      scene: 'garden',
      mood: 'night',
      lines: ['飞近带 📖 的地标会弹出「阅读故事」——36 篇上海故事等你集齐。', '准备好了吗？按下「开始城市飞行」，风在等你。'],
    },
  ],
};

// 统一查找：策展故事 + 引导篇章 + 关于作品
export const findStory = (id: string): LandmarkStory | undefined => {
  const s = storyById(id);
  if (s) return s;
  if (id === 'onboarding') return ONBOARDING_STORY;
  if (id === 'about') return ABOUT_STORY;
  return undefined;
};

// 关于作品篇（参赛说明页）：不进 stories 数组，顶栏「关于作品」打开。
export const ABOUT_STORY: LandmarkStory = {
  id: 'about',
  title: '关于本作品',
  accent: '#c9a876',
  panels: [
    {
      scene: 'tower-modern',
      mood: 'dusk',
      lines: [
        '这是一座会讲故事的上海。',
        '在 3D 城市上空飞行，飞近 36 个地标，读属于它们的四格漫画故事。',
      ],
    },
    {
      scene: 'tower-modern',
      mood: 'dusk',
      lines: [
        '技术：纯前端、零后端、零 Key。',
        'Vite + TypeScript（无框架）、MapLibre GL v6 的 3D 渲染、本地 PMTiles 高清瓦片（z16，离线可用）。',
      ],
    },
    {
      scene: 'street',
      mood: 'night',
      lines: [
        '内容：60+ 可搜索地点（36 本地 + Nominatim 在线）、航线导航、飞行尾迹与地标打卡。',
        '飞机精灵、座舱仪表、速度线全部由 SVG 与 CSS 手写，未使用任何素材库。',
      ],
    },
    {
      scene: 'garden',
      mood: 'night',
      lines: [
        '数据与署名：建筑与地名 © OpenStreetMap；瓦片 OpenFreeMap；搜索 Nominatim。',
        '献给每一位愿意从空中重新认识城市的人。',
      ],
    },
  ],
};

// 已读状态（localStorage，失败时静默降级为会话内有效）
const READ_KEY = 'atria-read-stories';

function safeRead(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function safeWrite(ids: string[]): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    // 沙盒环境不可写时静默降级
  }
}

export function isStoryRead(id: string): boolean {
  return safeRead().has(id);
}

export function markStoryRead(id: string): void {
  const set = safeRead();
  if (set.has(id)) return;
  set.add(id);
  safeWrite([...set]);
}
