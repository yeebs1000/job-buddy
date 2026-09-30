export const sourceManifest = {
  SG: {
    wages: "https://stats.mom.gov.sg/iMAS_Tables1/Wages/Wages_2025/mrsd_2025Wages_table4.xlsx",
    cpi: "https://tablebuilder.singstat.gov.sg/api/table/tabledata/M213752",
  },
  HK: {
    wages: "https://www.censtatd.gov.hk/wbr/B1050014/B10500142025AN25/att/en/B10500142025AN25.pdf",
    cpi: "https://www.censtatd.gov.hk/wbr/B1060001/B10600012026MM07/att/en/B10600012026MM07.pdf",
  },
  US: {
    wages: "https://www.bls.gov/oes/special-requests/oesm25all.zip",
    cpi: "https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0",
  },
} as const;

export const sourceHostnames = {
  SG: { wages: "stats.mom.gov.sg", cpi: "tablebuilder.singstat.gov.sg" },
  HK: { wages: "www.censtatd.gov.hk", cpi: "www.censtatd.gov.hk" },
  US: { wages: "www.bls.gov", cpi: "api.bls.gov" },
} as const;
