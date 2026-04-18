export type CaptureChannel =
  | 'form'
  | 'chat'
  | 'phone'
  | 'text'
  | 'email'
  | 'directions'
  | 'verified_offline';

export type CustomerAction =
  | 'form_submit'
  | 'chat_first_message_sent'
  | 'click_call'
  | 'click_text'
  | 'click_email'
  | 'click_directions';
