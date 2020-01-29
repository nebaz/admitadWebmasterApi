const fetch = require('node-fetch');
const ADMITAD_API_URL = 'https://api.admitad.com/';
const SCOPE = 'public_data websites manage_websites advcampaigns advcampaigns_for_website manage_advcampaigns banners landings banners_for_website payments manage_payments announcements referrals coupons coupons_for_website private_data tickets manage_tickets private_data_email private_data_phone private_data_balance validate_links deeplink_generator statistics opt_codes manage_opt_codes webmaster_retag manage_webmaster_retag broken_links manage_broken_links lost_orders manage_lost_orders broker_application manage_broker_application offline_sales offline_receipts manage_offline_receipts';
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
    let result = await (await fetch(ADMITAD_API_URL + 'token?grant_type=client_credentials&client_id=' + this.clientId + '&scope=' + SCOPE, {
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
    let balance = await this.apiRequest('me/balance/extended/');
    if (!Array.isArray(balance)) {
      return false;
    }
    balance = balance.find(it => it.currency === currency);
    let mainBalance = Number(balance.stalled) + Number(balance.balance);
    let holdAdv = Number(balance.stalled);
    let availableBalance = Number(balance.balance);
    let commissionOpen = Number(balance.processing);
    let {withdrawal, withdrawn} = await this.getFunds();
    return {mainBalance, holdAdv, availableBalance, commissionOpen, withdrawal, withdrawn};
  }

  async getFunds() {
    let withdrawal = 0;
    let withdrawn = 0;
    let offset = 0;
    for (let offset = 0; 1; offset += LIMIT) {
      let result = await this.apiRequest('payments/?offset=' + offset + '&limit=' + LIMIT);
      if (!result) break;
      for (let item of result.results) {
        if (item.status == 'pending') {
          withdrawal = Number((withdrawal + Number(item.payment_sum)).toFixed(2))
        }
        if (item.status == 'processed') {
          withdrawn = Number((withdrawn + Number(item.payment_sum)).toFixed(2))
        }
      }
      if (result._meta.count < offset + LIMIT) {
        break;
      }
    }
    return {withdrawal, withdrawn};
  }

  async getTrafficChannels() {
    let result = await this.apiRequest('websites/');
    return result.results;
  }

  async getOfferLinkByOfferId(offerId, trafficChannelId) {
    let result = await this.apiRequest('advcampaigns/' + offerId + '/website/' + trafficChannelId + '/');
    return result ? result.gotolink : false;
  }

  /**
   * short grouped statistics by offer
   * @return Array < {offerId,clicks,leadsOpen,...} >
   */
  async getStatisticsOffersByOfferId(dateFrom, dateTo, offerId = null, subid = null) {
    let params = 'statistics/campaigns/?limit=500&date_start=' + this.toAdmitadFormatDate(dateFrom) + '&date_end=' + this.toAdmitadFormatDate(dateTo);
    if (offerId) {
      params += '&campaign=' + offerId;
    }
    if (subid) {
      params += '&subid=' + subid;
    }
    let result = await this.apiRequest(params);
    if (result && Array.isArray(result.results)) {
      result.results.map(item => {
        item.offerId = Number(item.advcampaign_id) || 0;
        item.offerName = item.advcampaign_name || '';
        item.leadsRejected = 0;
        item.leadsOpen = 0;
        item.leadsApproved = 0;
        item.clicks = Number(item.clicks) || 0;
        item.backUrlCount = 0;
        item.commissionRejected = Number(item.payment_sum_declined) || 0;
        item.commissionOpen = Number(item.payment_sum_open) || 0;
        item.commissionApproved = Number(item.payment_sum_approved) || 0;
      });
      if (offerId) {
        result.results = result.results.filter(it => it.offerId === offerId);
      }
      return result.results;
    }
    return false;
  }

  async getLeadsByOfferId(dateFrom, dateTo, offerId = null, channelId = null) {
    let params = 'statistics/actions/?limit=500&date_start=' + this.toAdmitadFormatDate(dateFrom) + '&date_end=' + this.toAdmitadFormatDate(dateTo);
    if (offerId) {
      params += '&campaign=' + offerId;
    }
    if (channelId) {
      params += '&website=' + channelId;
    }
    let result = await this.apiRequest(params);
    if (result && Array.isArray(result.results)) {
      result.results.map(item => {
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
      return result.results;
    }
    return false;
  }

  async getCrByOfferId(dateFrom, dateTo, offerId, channelId = null) {
    let params = 'statistics/websites/?limit=500&date_start=' + this.toAdmitadFormatDate(dateFrom) + '&date_end=' + this.toAdmitadFormatDate(dateTo);
    params += '&campaign=' + offerId;
    if (channelId) {
      params += '&website=' + channelId;
    }
    let result = await this.apiRequest(params);
    if (result && Array.isArray(result.results)) {
      return result.results.map(item => ({
        channelId: Number(item.website_id) || 0,
        channelName: item.website_name,
        leads: (Number(item.sales_sum) || 0) + (Number(item.leads_sum) || 0),
        clicks: Number(item.clicks) || 0,
        cr: Number(item.cr) * 100
      }));
    }
    return false;
  }

  async apiRequest(params) {
    if (!this.token) {
      this.token = await this.getToken();
    }
    let url = ADMITAD_API_URL + params;
    // console.info('admitadApiRequest', new Date().toLocaleString(), url);
    let result;
    try {
      result = await (await fetch(url, {headers: {Authorization: 'Bearer ' + this.token}})).json();
    } catch (e) {
      console.error('admitad api error', e);
    }
    // console.info('admatadApiResult', new Date().toLocaleString());
    if (!result || result.status_code || result.error) {
      console.error('admitad api error: ', result ? result.details : '');
      return false;
    }
    return result;
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

}

module.exports = AdmitadApi;
