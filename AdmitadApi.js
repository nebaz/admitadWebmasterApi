const fetch = require('node-fetch');
const ADMITAD_API_URL = 'https://api.admitad.com/';
const SCOPE = 'payments public_data websites manage_websites advcampaigns advcampaigns_for_website manage_advcampaigns banners landings banners_for_website announcements referrals coupons coupons_for_website private_data private_data_email private_data_phone private_data_balance validate_links deeplink_generator statistics opt_codes manage_opt_codes webmaster_retag manage_webmaster_retag broken_links manage_broken_links lost_orders manage_lost_orders broker_application manage_broker_application aliexpress_commission vendor_tool short_link web_notificator';
const STATUS_REJECTED = 'rejected';
const STATUS_OPEN = 'open';
const STATUS_HOLD = 'hold';
const STATUS_APPROVED = 'approved';
const STATUS_PAID = 'paid';
const LIMIT = 500;

class AdmitadApi {

  static STATUS_REJECTED = STATUS_REJECTED;
  static STATUS_OPEN = STATUS_OPEN;
  static STATUS_HOLD = STATUS_HOLD;
  static STATUS_APPROVED = STATUS_APPROVED;
  static STATUS_PAID = STATUS_PAID;

  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  toAdmitadFormatDate(timestamp) {
    timestamp = Math.min(timestamp, Date.now());  // otherwise admitad api will crash
    let dd = new Date(timestamp).getDate();
    let mm = new Date(timestamp).getMonth() + 1;
    return [(dd > 9 ? '' : '0') + dd, (mm > 9 ? '' : '0') + mm, new Date(timestamp).getFullYear()].join('.');
  }

  async getToken() {
    let data = this.clientId + ':' + this.clientSecret;
    let result = await (await fetch(ADMITAD_API_URL + 'token/?grant_type=client_credentials&client_id=' + this.clientId + '&scope=' + SCOPE, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(data).toString('base64')
      }
    })).json();
    if (result.error_description) {
      console.error(result.error_description);
      return false;
    }
    return result.access_token;
  }

  async getProfile() {
    return await this.apiRequest('me/');
  }

  async getBalance(currency) {
    let {ok, errorMessage, result: balance} = await this.apiRequest('me/balance/extended/');
    if (!Array.isArray(balance)) {
      return {ok: false, errorMessage};
    }
    balance = balance.find(it => it.currency === currency) || {stalled: 0, balance: 0, processing: 0};
    let mainBalance = Number(balance.stalled) + Number(balance.balance);
    let holdAdv = Number(balance.stalled);
    let availableBalance = Number(balance.balance);
    let commissionOpen = Number(balance.processing);
    let {withdrawal, withdrawn} = await this.getFunds(currency);
    return {ok: true, result: {mainBalance, holdAdv, availableBalance, commissionOpen, withdrawal, withdrawn}};
  }

  async getFunds(currency) {
    let withdrawal = 0;
    let withdrawn = 0;
    let ok;
    let result;
    let offset = 0;
    do {
      ({ok, result} = await this.apiRequest('payments/?offset=' + offset + '&limit=' + LIMIT));
      if (!ok) break;
      if (currency) {
        result.results = result.results.filter(it => it.currency === currency);
      }
      for (let item of result.results) {
        if (item.status == 'pending') {
          withdrawal = Number((withdrawal + Number(item.payment_sum)).toFixed(2))
        }
        if (item.status == 'processed') {
          withdrawn = Number((withdrawn + Number(item.payment_sum)).toFixed(2))
        }
      }
      offset += LIMIT;
    } while (this.hasNextPage(result));
    return {withdrawal, withdrawn};
  }

  async getTrafficChannels() {
    let {ok, result, errorMessage} = await this.apiRequest('websites/');
    if (ok) {
      return {ok, result: result.results};
    } else {
      return {ok, errorMessage};
    }
  }

  async getOffersData(offerId) {
    let result = [];
    let apiData;
    let offset = 0;
    do {
      let params = 'advcampaigns/';
      if (offerId) {
        params += offerId + '/';
      }
      params += '?offset=' + offset + '&limit=' + LIMIT;
      apiData = await this.apiRequest(params);
      if (!apiData.ok) {
        return {ok: false, errorMessage: apiData.errorMessage};
      }
      if (!Array.isArray(apiData?.result?.results)) {
        return {ok: true, result: apiData};
      }
      result = result.concat(apiData.result.results);
      offset += LIMIT;
    } while (this.hasNextPage(apiData.result));
    return {ok: true, result};
  }

  async getOfferLinkByOfferId(offerId, trafficChannelId) {
    let {ok, result, errorMessage} = await this.apiRequest('advcampaigns/' + offerId + '/website/' + trafficChannelId + '/');
    if (ok && result.gotolink) {
      return {ok: true, result: result.gotolink};
    }
    if (ok && result.connection_status === 'declined') {
      return {ok: false, errorMessage: 'unsubscribed'};
    }
    return {ok: false, errorMessage};
  }

  /**
   * short grouped statistics by offer
   * @return Array < {offerId,clicks,leadsOpen,...} >
   */
  async getStatisticsOffers(dateFrom, dateTo, offerId = null, channelId = null, subid = null) {
    let params = 'statistics/campaigns/?limit=500&date_start=' + this.toAdmitadFormatDate(dateFrom) + '&date_end=' + this.toAdmitadFormatDate(dateTo);
    if (offerId) {
      params += '&campaign=' + offerId;
    }
    if (channelId) {
      params += '&website=' + channelId;
    }
    if (subid) {
      params += '&subid=' + subid;
    }
    let {ok, result, errorMessage} = await this.apiRequest(params);
    if (ok && Array.isArray(result?.results)) {
      result.results.map(item => {
        item.offerId = Number(item.advcampaign_id) || 0;
        item.offerName = item.advcampaign_name || '';
        item.clicks = Number(item.clicks) || 0;
        item.backUrlCount = 0;  // do not supported
        item.leads = (Number(item.sales_sum) || 0) + (Number(item.leads_sum) || 0);
        item.cr = Number(item.cr) * 100;
        item.leadsRejected = 0;  // do not supported
        item.leadsOpen = 0;  // do not supported
        item.leadsApproved = 0;  // do not supported
        item.commissionRejected = Number(item.payment_sum_declined) || 0;
        item.commissionOpen = Number(item.payment_sum_open) || 0;
        item.commissionApproved = Number(item.payment_sum_approved) || 0;
      });
      if (offerId) {
        result.results = result.results.filter(it => it.offerId === offerId);
      }
      return {ok, result: result.results};
    }
    return {ok: false, errorMessage};
  }

  /**
   * @returns Array<Object>
   */
  async getLeadsByOfferId(dateFrom, dateTo, offerId = null, channelId = null) {
    let result = [];
    let apiData;
    let offset = 0;
    do {
      let params = 'statistics/actions/?offset=' + offset + '&limit=' + LIMIT + '&date_start=' + this.toAdmitadFormatDate(dateFrom) + '&date_end=' + this.toAdmitadFormatDate(dateTo);
      if (offerId) {
        params += '&campaign=' + offerId;
      }
      if (channelId) {
        params += '&website=' + channelId;
      }
      apiData = await this.apiRequest(params);
      if (!apiData.ok || !Array.isArray(apiData?.result?.results)) {
        return {ok: false, errorMessage: apiData.errorMessage};
      }
      apiData.result.results.map(item => {
        item.orderId = item.id.toString();
        item.offerId = Number(item.advcampaign_id);
        item.offerName = item.advcampaign_name;
        item.status = this.getLeadStatus(item.status, item.paid);
        item.commission = Number(item.payment);
        item.leadTime = Date.parse(item.action_date);
        item.uploadTime = Date.parse(item.closing_date);
        item.subaccount1 = item.subid;
        item.subaccount2 = item.subid1;
      });
      result = result.concat(apiData.result.results);
      offset += LIMIT;
    } while (this.hasNextPage(apiData.result));
    return {ok: true, result};
  }

  async getCrByOfferId(dateFrom, dateTo, offerId, channelId = null) {
    let params = 'statistics/websites/?limit=500&date_start=' + this.toAdmitadFormatDate(dateFrom) + '&date_end=' + this.toAdmitadFormatDate(dateTo);
    params += '&campaign=' + offerId;
    if (channelId) {
      params += '&website=' + channelId;
    }
    let {ok, result, errorMessage} = await this.apiRequest(params);
    if (ok && Array.isArray(result?.results)) {
      return {
        ok,
        result: result.results.map(item => ({
          channelId: Number(item.website_id) || 0,
          channelName: item.website_name,
          leads: (Number(item.sales_sum) || 0) + (Number(item.leads_sum) || 0),
          clicks: Number(item.clicks) || 0,
          cr: Number(item.cr) * 100
        }))
      };
    }
    return {ok: false, errorMessage};
  }

  async apiRequest(params) {
    if (!this.token) {
      this.token = await this.getToken();
    }
    let url = ADMITAD_API_URL + params;
    // console.info('admitadApiRequest', new Date().toLocaleString(), url, this.token);
    let result;
    try {
      result = await (await fetch(url, {headers: {Authorization: 'Bearer ' + this.token}})).json();
    } catch (e) {
      console.error('admitad api error', e);
    }
    // console.info('admatadApiResult', new Date().toLocaleString());
    if (!result || result.status_code || result.error) {
      console.error('admitad api error: ', result);
      return {ok: false, errorMessage: result?.error};
    }
    return {ok: true, result};
  }

  getLeadStatus(status, paid) {
    switch (status) {
      case 'pending':
        return STATUS_OPEN;
      case 'declined':
        return STATUS_REJECTED;
      case 'approved_but_stalled':
        return STATUS_HOLD;
      case 'approved':
        return paid === 1 ? STATUS_PAID : STATUS_APPROVED;
      default:
        return status;
    }
  }

  hasNextPage(apiResult) {
    return apiResult._meta.count > apiResult._meta.offset + apiResult._meta.limit;
  }

}

module.exports = AdmitadApi;
