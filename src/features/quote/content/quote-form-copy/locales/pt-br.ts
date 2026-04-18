import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyPtBr = {
  title: 'Conte sobre o seu projeto',
  description:
    'Conte para nós o que precisa de reparo ou de trabalho de estofamento. Se você já tiver fotos, mencione isso na mensagem.',
  vehicleLabel: 'Detalhes do veículo ou item',
  namePlaceholder: 'Seu nome',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'nome@exemplo.com.br',
  vehiclePlaceholder: 'ex.: Camaro SS 1969, banco de moto ou assento de barco',
  serviceLabel: 'Serviço necessário',
  servicePlaceholder: 'Selecione um serviço',
  messageLabel: 'Conte sobre o seu projeto',
  messagePlaceholder:
    'Descreva o que precisa de reparo ou de estofamento, a condição atual e qualquer detalhe útil para o orçamento.',
  submitLabel: 'Enviar solicitação de orçamento',
  submittingLabel: 'Enviando...',
  successTitle: 'Obrigado. Sua solicitação foi recebida.',
  successBody: 'Cada solicitação é revisada manualmente e entraremos em contato em breve.',
  errorTitle: 'Não conseguimos enviar sua solicitação.',
  validationInvalidInput: 'Revise o formulário e tente novamente.',
  validationMissingContactMethod: 'Adicione um número de telefone, um endereço de email ou ambos.',
  validationInvalidPhone: 'Digite um número de telefone válido.',
  validationInvalidEmail: 'Digite um endereço de email válido.',
  validationMissingEndpoint:
    'O formulário de orçamento ainda não está configurado. Tente novamente em breve.',
  validationFallbackError:
    'Não conseguimos enviar sua solicitação de orçamento. Tente novamente ou ligue para a oficina.',
  otherServiceLabel: 'Outro / Ainda não tenho certeza',
} satisfies QuoteFormLocaleCopy;
