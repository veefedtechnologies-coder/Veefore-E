import axios from 'axios';

async function test() {
    const token = 'EAAPPeGuYkQ8BQqtGDwCa6jIJWCiDgXQT0CaZABpnOMu1jTWv0ryoJn8E4by7SkVaagUnHrKHOWbbMU3w4dXYXO7D3NMDjBMeXz0JP48QJxKjs6c2v0jb4HJMo63jZCBUkjrVL10NDZCX4ZB8jFjADHFZCLlqe2eLVV6A56WK0NxRQhxJIkPHtDZAx7kjuNhthJ';
    const accountId = '17841406961110225';

    const combinations = [
        'city',
        'country',
        'age,gender',
        'age',
        'gender'
    ];

    for (const breakdown of combinations) {
        const url = `https://graph.facebook.com/v22.0/${accountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${breakdown}&access_token=${token}`;
        console.log(`\nTesting: ${breakdown}`);
        try {
            const res = await axios.get(url);
            console.log('Success!');
            console.log(JSON.stringify(res.data, null, 2));
        } catch (err: any) {
            console.error('Error:', err.response?.data?.error?.message || err.message);
        }
    }
}

test();
