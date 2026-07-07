package arca

import "encoding/xml"

// --- WSAA: Autenticación ---

type LoginTicketRequest struct {
	XMLName xml.Name `xml:"loginTicketRequest"`
	Header  TRAHeader `xml:"header"`
	Service string    `xml:"service"`
}

type TRAHeader struct {
	UniqueID         string `xml:"uniqueId"`
	GenerationTime   string `xml:"generationTime"`
	ExpirationTime   string `xml:"expirationTime"`
}

type LoginCMSRequest struct {
	XMLName xml.Name `xml:"soapenv:Envelope"`
	SoapEnv string   `xml:"xmlns:soapenv,attr"`
	WSLogin string   `xml:"xmlns:wslogin,attr"`
	Body    LoginCMSBody `xml:"soapenv:Body"`
}

type LoginCMSBody struct {
	LoginCMS LoginCMSParam `xml:"wslogin:loginCms"`
}

type LoginCMSParam struct {
	In string `xml:"wslogin:in"`
}

type LoginCMSResponse struct {
	XMLName xml.Name         `xml:"Envelope"`
	Body    LoginCMSRespBody `xml:"Body"`
}

type LoginCMSRespBody struct {
	LoginCMSReturn LoginCMSReturn `xml:"loginCmsResponse>loginCmsReturn"`
}

type LoginCMSReturn struct {
	Value string `xml:",chardata"`
}

type TicketAcceso struct {
	XMLName xml.Name    `xml:"loginTicketResponse"`
	Header  TAHeader    `xml:"header"`
	Credentials TACredentials `xml:"credentials"`
}

type TAHeader struct {
	Source         string `xml:"source"`
	Destination    string `xml:"destination"`
	UniqueID       string `xml:"uniqueId"`
	GenerationTime string `xml:"generationTime"`
	ExpirationTime string `xml:"expirationTime"`
}

type TACredentials struct {
	Token string `xml:"token"`
	Sign  string `xml:"sign"`
}

// --- WSFE: Facturación electrónica ---

// Tipo de comprobante AFIP
const (
	TipoFacturaA = 1  // Factura A (empresa con CUIT)
	TipoFacturaB = 6  // Factura B (consumidor final)
)

// Tipo de documento receptor
const (
	TipoDocCUIT            = 80 // CUIT
	TipoDocConsumidorFinal = 99 // Sin identificar / consumidor final
)

type FEAuthRequest struct {
	Token string `xml:"Token"`
	Sign  string `xml:"Sign"`
	Cuit  int64  `xml:"Cuit"`
}

type FECAEDetRequest struct {
	Concepto       int     `xml:"Concepto"`
	DocTipo        int     `xml:"DocTipo"`
	DocNro         int64   `xml:"DocNro"`
	CbteDesde      int64   `xml:"CbteDesde"`
	CbteHasta      int64   `xml:"CbteHasta"`
	CbteFch        string  `xml:"CbteFch"`
	ImpTotal       float64 `xml:"ImpTotal"`
	ImpTotConc     float64 `xml:"ImpTotConc"`
	ImpNeto        float64 `xml:"ImpNeto"`
	ImpOpEx        float64 `xml:"ImpOpEx"`
	ImpIVA         float64 `xml:"ImpIVA"`
	ImpTrib        float64 `xml:"ImpTrib"`
	MonId          string  `xml:"MonId"`
	MonCotiz       float64 `xml:"MonCotiz"`
	Iva            *FEIVAArray `xml:"Iva,omitempty"`
}

type FEIVAArray struct {
	AlicIva []FEAlicIva `xml:"AlicIva"`
}

// AlicIva Id=5 corresponde a IVA 21%
type FEAlicIva struct {
	Id      int     `xml:"Id"`
	BaseImp float64 `xml:"BaseImp"`
	Importe float64 `xml:"Importe"`
}

type FECAECabRequest struct {
	CantReg  int    `xml:"CantReg"`
	PtoVta   int    `xml:"PtoVta"`
	CbteTipo int    `xml:"CbteTipo"`
}

// Respuesta del CAE
type FECAEDetResponse struct {
	CAE       string `xml:"CAE"`
	CAEFchVto string `xml:"CAEFchVto"`
	Resultado string `xml:"Resultado"`
}

// Datos para armar el QR AFIP
type DatosQR struct {
	Ver       int     `json:"ver"`
	Fecha     string  `json:"fecha"`
	CUIT      int64   `json:"cuit"`
	PtoVta    int     `json:"ptoVta"`
	TipoCmp   int     `json:"tipoCmp"`
	NroCmp    int64   `json:"nroCmp"`
	Importe   float64 `json:"importe"`
	Moneda    string  `json:"moneda"`
	Ctz       float64 `json:"ctz"`
	TipoDocRec int   `json:"tipoDocRec"`
	NroDocRec  int64 `json:"nroDocRec"`
	TipoCodAut string `json:"tipoCodAut"`
	CodAut     int64 `json:"codAut"`
}
