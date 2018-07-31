const charset = require('superagent-charset');
const request = charset(require('superagent'));
const cheerio = require('cheerio');
const fs = require('fs');
const qs = require('qs');
const url_util = require('url');
const cookie = require('./taobao_cookie');
const sign = require('./taobao_sign');
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1';
const taobao_list = require('./taobao_list');

const APP_KEY = 12574478;

const agent = request.agent();

//下载商品信息
const downGoods = async function(url){

    let ret = {};

    if(url.includes('detail')){
        ret = await downDetail(url);
    }

    if(url.includes('item')){
        ret = await downItem(url);
    }

    const {title, props, sliderImgUrls, detailImgUrls } = ret;
    let dir = 'goods/' + title;
    fs.mkdir(dir, ()=>{
        let content = props.map((prop)=>{
            return prop.ptext + ':' + prop.vtexts;
        });
        fs.appendFile(dir + '/info.txt', content.join('\n'), function (err) {
            if (err){
                console.log("fail " + err);
            }
        });
        sliderImgUrls.forEach((url, index) =>{
            const req = request.get(url);
            const stream = fs.createWriteStream(dir + '/slider_' + index + '.jpg');
            req.pipe(stream);
        });
        detailImgUrls.forEach((url, index) =>{
            const req = request.get(url);
            const stream = fs.createWriteStream(dir + '/detail_' + index + '.jpg');
            req.pipe(stream);
        });
        console.log('下载成功:' + url);
    });
};

const downDetail = async function(url){

    const res = await agent.get(url).set(
        {
            'User-Agent': userAgent,
            'Cookie': cookie
        }).charset().then(res =>{
            return res;

    }).catch(err =>{
        console.log(err)
        console.log('抓取失败：'+ url)
    });


    const $ = cheerio.load(res.text);

    //抓取商品信息
    const script = $('.actionBar-bg').next();
    const script_content = $(script).html();
    eval(script_content);
    const dataDetail = _DATA_Detail;
    const title = dataDetail.item.title;
    const props_obj =  dataDetail.props.groupProps[0]['基本信息'];
    const props = props_obj.map(prop =>{
        let _prop;
        for(let key in prop){
            _prop = {ptext: key, vtexts: prop[key]};
        }
        return _prop
    });
    props.unshift({ptext: '标题', vtexts:[title]});
    props.unshift({ptext: '链接', vtexts:[url]});

    //抓取轮播图
    const sliderImg = $('.preview-scroller img');
    const sliderImgUrls = [];
    sliderImg.map((i, img)=>{
        let url = $(img).attr('data-src') + '_760x760Q50s50.jpg';
        sliderImgUrls.push('http:' + url);
    });

    //抓取详情图
    const detailImg = $('.lazyImg');
    const detailImgUrls = [];
    detailImg.map((i, img)=>{
        let url = $(img).attr('data-ks-lazyload') + '_760x760Q50s50.jpg';
        detailImgUrls.push(url);
    });

    return {
        title, props, sliderImgUrls, detailImgUrls
    }

};


const downItem = async function(url){
    const query = url_util.parse(url, true).query;
    const detail_url = 'https://h5api.m.taobao.com/h5/mtop.taobao.detail.getdetail/6.0/?api=mtop.taobao.detail.getdetail';
    let ret = {};
    let data = {
        "itemNumId": query.id,
        "exParams":{
            "spm": query['spm'],
            "id": query['id'],
            "amp;_u": query['amp;_u']
        }
    };

    await agent.get(detail_url).query(
        {
            data: JSON.stringify(data)
        }
    ).set(
        {
            'User-Agent': userAgent
        }).charset().then(res =>{
            const resJson = JSON.parse(res.text);
            const item = resJson.data.item;
            ret.title = item.title;
            ret.sliderImgUrls = item.images.map((img)=>{
                let url = img + '_760x760Q50s50.jpg';
                return 'http:' + url;
            });
            const props_obj =  resJson.data.props.groupProps[0]['基本信息'];
            const props = props_obj.map(prop =>{
                let _prop;
                for(let key in prop){
                    _prop = {ptext: key, vtexts: prop[key]};
                }
                return _prop
            });
            props.unshift({ptext: '标题', vtexts:[item.title]});
            props.unshift({ptext: '链接', vtexts:[url]});
            ret.props = props;
    }).catch(err =>{
        console.log(err)
        console.log('抓取失败：'+ url)
    });

    let getDesc= async (cookie)=>{
        const desc_url = 'https://h5api.m.taobao.com/h5/mtop.wdetail.getitemdescx/4.1/?api=mtop.wdetail.getItemDescx';
        const token = cookie ? sign.getToken(cookie) : '';
        const t = Date.now();

        const data = {
            "item_num_id": query.id
        };

        const signParams = [token, t, APP_KEY, JSON.stringify(data)].join('&');

        return agent.get(desc_url).query(
            {
                jsv: '2.4.11',
                v: 4.1,
                t,
                appKey: APP_KEY,
                sign: sign.makeSign(signParams),
                data: JSON.stringify(data)
            }
        ).set(
            {
                'User-Agent': userAgent
            }).charset().then(res =>{
            const resJson = JSON.parse(res.text);
            if(!resJson.data.images){
                return getDesc(res.headers['set-cookie'].toString());
            }else{
                const images = resJson.data.images;
                const detailImgUrls = images.map(img=>{
                    let url = img + '_760x760Q50s50.jpg';
                    return url;
                });
                return detailImgUrls;
            }
        })
    };

    ret.detailImgUrls = await getDesc();

    return ret;
};


(async ()=>{
    for( let url of taobao_list){
            await new Promise((resolve) => {
                setTimeout(async()=>{
                    try {
                        console.log(url)
                        await downGoods(url);
                        resolve();
                    }catch (e) {
                        console.log(e)
                    }

                }, 3000);
            });
    }
})();

console.log('总计:'+ taobao_list.length);



