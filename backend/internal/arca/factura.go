package arca

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"
)

const (
	wsfeURLTesting    = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx"
	wsfeURLProduccion = "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
)

type SolicitarCAEParams struct {
	CUIT        int64
	PuntoVenta  int
	TipoCmp     int
	NroComprobante int64
	Fecha       time.Time
	// Montos en pesos argentinos, IVA 21%
	Subtotal    float64
	IVA         float64
	Total       float64
	// Para facturas A: datos del receptor
	DocTipoRec  int
	DocNroRec   int64
}

type ResultadoCAE struct {
	CAE    string
	FchVto time.Time
	NroCmp int64
	QRData string // base64 para el QR
}

// SolicitarCAE pide el CAE a AFIP/ARCA vía WSFE.
func SolicitarCAE(ctx context.Context, params SolicitarCAEParams, token, sign, env string) (*ResultadoCAE, error) {
	url := wsfeURLTesting
	if env == "produccion" {
		url = wsfeURLProduccion
	}

	fechaStr := params.Fecha.Format("20060102")
	nro := params.NroComprobante

	soapBody := buildFECAESolicitarSOAP(params, token, sign, fechaStr, nro)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBufferString(soapBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", "http://ar.gov.afip.dif.FEV1/FECAESolicitar")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP WSFE: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	cae, fchVto, err := parseCAEResponse(body)
	if err != nil {
		return nil, err
	}

	codAut, _ := strconv.ParseInt(cae, 10, 64)
	fchVtoParsed, _ := time.Parse("20060102", fchVto)

	qr, err := buildQR(params, nro, codAut)
	if err != nil {
		slog.Warn("error generando QR", "err", err)
	}

	slog.Info("CAE obtenido", "cae", cae, "vto", fchVto, "nro", nro)

	return &ResultadoCAE{
		CAE:    cae,
		FchVto: fchVtoParsed,
		NroCmp: nro,
		QRData: qr,
	}, nil
}

func buildFECAESolicitarSOAP(p SolicitarCAEParams, token, sign, fecha string, nro int64) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>%s</ar:Token>
        <ar:Sign>%s</ar:Sign>
        <ar:Cuit>%d</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>%d</ar:PtoVta>
          <ar:CbteTipo>%d</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>%d</ar:DocTipo>
            <ar:DocNro>%d</ar:DocNro>
            <ar:CbteDesde>%d</ar:CbteDesde>
            <ar:CbteHasta>%d</ar:CbteHasta>
            <ar:CbteFch>%s</ar:CbteFch>
            <ar:ImpTotal>%.2f</ar:ImpTotal>
            <ar:ImpTotConc>0</ar:ImpTotConc>
            <ar:ImpNeto>%.2f</ar:ImpNeto>
            <ar:ImpOpEx>0</ar:ImpOpEx>
            <ar:ImpIVA>%.2f</ar:ImpIVA>
            <ar:ImpTrib>0</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:Iva>
              <ar:AlicIva>
                <ar:Id>5</ar:Id>
                <ar:BaseImp>%.2f</ar:BaseImp>
                <ar:Importe>%.2f</ar:Importe>
              </ar:AlicIva>
            </ar:Iva>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`,
		token, sign, p.CUIT,
		p.PuntoVenta, p.TipoCmp,
		p.DocTipoRec, p.DocNroRec,
		nro, nro, fecha,
		p.Total, p.Subtotal, p.IVA,
		p.Subtotal, p.IVA,
	)
}

func parseCAEResponse(body []byte) (cae, fchVto string, err error) {
	var envelope struct {
		XMLName xml.Name `xml:"Envelope"`
		Body    struct {
			Response struct {
				Result struct {
					FeDetResp struct {
						Item struct {
							CAE       string `xml:"CAE"`
							CAEFchVto string `xml:"CAEFchVto"`
							Resultado string `xml:"Resultado"`
							Obs       []struct {
								Code int    `xml:"Code"`
								Msg  string `xml:"Msg"`
							} `xml:"Observaciones>Obs"`
						} `xml:"FECAEDetResponse"`
					} `xml:"FeDetResp"`
					Errors []struct {
						Code int    `xml:"Code"`
						Msg  string `xml:"Msg"`
					} `xml:"Errors>Err"`
				} `xml:"FECAESolicitarResult"`
			} `xml:"FECAESolicitarResponse"`
		} `xml:"Body"`
	}

	if err := xml.Unmarshal(body, &envelope); err != nil {
		return "", "", fmt.Errorf("parsear respuesta WSFE: %w", err)
	}

	det := envelope.Body.Response.Result.FeDetResp.Item
	if det.Resultado != "A" {
		var msgs []string
		for _, o := range det.Obs {
			msgs = append(msgs, fmt.Sprintf("[%d] %s", o.Code, o.Msg))
		}
		for _, e := range envelope.Body.Response.Result.Errors {
			msgs = append(msgs, fmt.Sprintf("ERROR[%d] %s", e.Code, e.Msg))
		}
		return "", "", fmt.Errorf("AFIP rechazó el comprobante: %v", msgs)
	}

	return det.CAE, det.CAEFchVto, nil
}

// buildQR genera el base64 del JSON para el QR AFIP (formato obligatorio)
func buildQR(p SolicitarCAEParams, nro, codAut int64) (string, error) {
	datos := DatosQR{
		Ver:        1,
		Fecha:      p.Fecha.Format("2006-01-02"),
		CUIT:       p.CUIT,
		PtoVta:     p.PuntoVenta,
		TipoCmp:    p.TipoCmp,
		NroCmp:     nro,
		Importe:    p.Total,
		Moneda:     "PES",
		Ctz:        1,
		TipoDocRec: p.DocTipoRec,
		NroDocRec:  p.DocNroRec,
		TipoCodAut: "E",
		CodAut:     codAut,
	}

	jsonBytes, err := json.Marshal(datos)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(jsonBytes), nil
}
