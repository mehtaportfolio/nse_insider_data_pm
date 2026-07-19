import axios from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

const jar = new CookieJar();

const client = wrapper(
    axios.create({
        jar,
        withCredentials: true,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            Referer:
                "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading",
            "Accept-Language": "en-US,en;q=0.9"
        }
    })
);

export default client;